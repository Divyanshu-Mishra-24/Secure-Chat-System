import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import Request, Response, HTTPException, status, Depends
import sqlite3
import os
from database import get_db

SESSION_EXPIRE_DAYS = 14
COOKIE_NAME = "signal_session"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true" if os.getenv("RENDER") else "false").lower() in {"1", "true", "yes"}
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "none" if COOKIE_SECURE else "lax").lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise ValueError("COOKIE_SAMESITE must be 'lax', 'strict', or 'none'")
if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
    raise ValueError("COOKIE_SECURE must be true when COOKIE_SAMESITE is 'none'")

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()

def create_session(db: sqlite3.Connection, user_id: int, response: Response) -> str:
    # Cleanup expired sessions
    now_iso = datetime.utcnow().isoformat()
    db.execute("DELETE FROM sessions WHERE expires_at < ?", (now_iso,))
    
    token = secrets.token_hex(32)
    session_hash = hash_token(token)
    expires_at = (datetime.utcnow() + timedelta(days=SESSION_EXPIRE_DAYS)).isoformat()

    db.execute(
        "INSERT INTO sessions (session_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (session_hash, user_id, now_iso, expires_at)
    )
    db.commit()

    # Set HTTP-only Cookie
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=SESSION_EXPIRE_DAYS * 24 * 3600,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
    )
    return token

def get_current_user(request: Request, db: sqlite3.Connection = Depends(get_db)):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        # Check Authorization header as fallback (e.g. Bearer token)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    session_hash = hash_token(token)
    now_iso = datetime.utcnow().isoformat()

    cursor = db.cursor()
    cursor.execute("""
        SELECT u.id, u.identifier, u.display_name, u.avatar_url, u.status_message, u.is_online, u.last_seen, u.safety_number
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.session_hash = ? AND s.expires_at > ?
    """, (session_hash, now_iso))

    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid")

    return dict(row)
