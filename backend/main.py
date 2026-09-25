from fastapi import FastAPI, Depends, HTTPException, status, Response, Request, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import sqlite3
import shutil
from pathlib import Path
from datetime import datetime, timedelta
import json
import logging
import uuid
import os

from database import init_db, get_db, get_db_connection, DB_PATH, UPLOADS_DIR
from models import (
    StartAuthRequest, VerifyAuthRequest, UserUpdate,
    AddContactRequest, CreateDirectConversationRequest,
    CreateGroupConversationRequest, SetDisappearingTimerRequest,
    GroupMemberUpdate, SendMessageRequest, ReactionRequest
)
from auth import create_session, get_current_user, COOKIE_NAME, hash_token
from websocket_manager import manager
from seed import seed_database, generate_safety_number

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("signal_backend")

app = FastAPI(title="Signal Messenger Clone API", version="1.0.0")

# Enable CORS for localhost:3000
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for user avatars and chat uploads
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

@app.on_event("startup")
def on_startup():
    init_db()
    seed_database(DB_PATH)
    presence_db = get_db_connection()
    presence_db.execute(
        "UPDATE users SET is_online = 0, last_seen = ? WHERE is_online = 1",
        (datetime.utcnow().isoformat(),)
    )
    presence_db.commit()
    presence_db.close()
    logger.info("Signal API initialized successfully with database & seed data.")

# -------------------------------------------------------------------
# AUTHENTICATION ENDPOINTS
# -------------------------------------------------------------------

@app.post("/api/auth/start")
def auth_start(body: StartAuthRequest, db: sqlite3.Connection = Depends(get_db)):
    identifier = body.identifier.strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Identifier cannot be empty.")
    
    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE LOWER(identifier) = LOWER(?)", (identifier,))
    user = cursor.fetchone()

    suggestions = []
    if body.is_registration and user:
        # Offer available username variants by adding a random numeric suffix.
        attempts = 0
        while len(suggestions) < 3 and attempts < 30:
            candidate = f"{identifier}{uuid.uuid4().int % 9000 + 1000}"
            cursor.execute("SELECT 1 FROM users WHERE LOWER(identifier) = LOWER(?)", (candidate,))
            if not cursor.fetchone() and candidate not in suggestions:
                suggestions.append(candidate)
            attempts += 1

    return {
        "identifier": identifier,
        "is_new_user": user is None,
        "suggestions": suggestions,
    }

@app.post("/api/auth/verify")
def auth_verify(body: VerifyAuthRequest, response: Response, db: sqlite3.Connection = Depends(get_db)):
    identifier = body.identifier.strip()
    otp = body.otp.strip()

    if otp != "123456":
        raise HTTPException(status_code=400, detail="Invalid verification code. Use demo code: 123456")

    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(identifier) = LOWER(?)", (identifier,))
    user = cursor.fetchone()

    if body.is_registration and user:
        candidate = f"{identifier}{uuid.uuid4().int % 9000 + 1000}"
        raise HTTPException(
            status_code=409,
            detail=f"That username is already taken. Try {candidate} instead."
        )

    if not user:
        if not body.display_name or not body.display_name.strip():
            raise HTTPException(status_code=400, detail="Display name is required for new accounts.")
        
        display_name = body.display_name.strip()
        avatar = body.avatar_url or f"https://api.dicebear.com/7.x/bottts/svg?seed={identifier}"
        safety_no = generate_safety_number(1, random_int := uuid.uuid4().int % 100000)
        now_iso = datetime.utcnow().isoformat()
        try:
            cursor.execute(
                "INSERT INTO users (identifier, display_name, avatar_url, safety_number, created_at) VALUES (?, ?, ?, ?, ?)",
                (identifier, display_name, avatar, safety_no, now_iso)
            )
        except sqlite3.IntegrityError:
            candidate = f"{identifier}{uuid.uuid4().int % 9000 + 1000}"
            raise HTTPException(status_code=409, detail=f"That username is already taken. Try {candidate} instead.")
        db.commit()
        user_id = cursor.lastrowid
    else:
        user_id = user["id"]

    token = create_session(db, user_id, response)

    cursor.execute("SELECT id, identifier, display_name, avatar_url, status_message, is_online, last_seen, safety_number FROM users WHERE id = ?", (user_id,))
    user_data = dict(cursor.fetchone())

    return {
        "status": "success",
        "user": user_data,
        "token": token
    }

@app.get("/api/auth/me")
def auth_me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}

@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        session_hash = hash_token(token)
        db.execute("DELETE FROM sessions WHERE session_hash = ?", (session_hash,))
        db.commit()
    response.delete_cookie(COOKIE_NAME)
    return {"status": "logged_out"}

# -------------------------------------------------------------------
# USER & CONTACT ENDPOINTS
# -------------------------------------------------------------------

@app.patch("/api/users/profile")
def update_profile(body: UserUpdate, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    fields = []
    values = []

    if body.display_name is not None:
        fields.append("display_name = ?")
        values.append(body.display_name.strip())
    if body.avatar_url is not None:
        fields.append("avatar_url = ?")
        values.append(body.avatar_url)
    if body.status_message is not None:
        fields.append("status_message = ?")
        values.append(body.status_message.strip())

    if fields:
        values.append(current_user["id"])
        cursor.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
        db.commit()

    cursor.execute("SELECT id, identifier, display_name, avatar_url, status_message, is_online, last_seen, safety_number FROM users WHERE id = ?", (current_user["id"],))
    return {"user": dict(cursor.fetchone())}

@app.get("/api/users/preferences")
def get_user_preferences(current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)", (current_user["id"],))
    db.commit()
    row = db.execute(
        "SELECT read_receipts_enabled, notifications_enabled, default_disappearing_timer FROM user_preferences WHERE user_id = ?",
        (current_user["id"],)
    ).fetchone()
    return {"preferences": dict(row)}

@app.patch("/api/users/preferences")
def update_user_preferences(body: dict = Body(...), current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    allowed = {"read_receipts_enabled", "notifications_enabled", "default_disappearing_timer"}
    valid_timer = lambda value: type(value) is int and value in {0, 5, 30, 60, 3600, 86400}
    if not body or any(
        key not in allowed or (key == "default_disappearing_timer" and not valid_timer(value))
        or (key != "default_disappearing_timer" and not isinstance(value, bool))
        for key, value in body.items()
    ):
        raise HTTPException(status_code=400, detail="Provide valid user preference values")

    db.execute("INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)", (current_user["id"],))
    fields = ", ".join(f"{key} = ?" for key in body)
    db.execute(
        f"UPDATE user_preferences SET {fields} WHERE user_id = ?",
        (*body.values(), current_user["id"])
    )
    db.commit()
    row = db.execute(
        "SELECT read_receipts_enabled, notifications_enabled, default_disappearing_timer FROM user_preferences WHERE user_id = ?",
        (current_user["id"],)
    ).fetchone()
    return {"preferences": dict(row)}

@app.get("/api/users/search")
def search_users(q: str = "", current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    query_str = f"%{q.strip()}%"
    cursor.execute(
        """SELECT id, identifier, display_name, avatar_url, status_message, is_online, last_seen, safety_number
           FROM users
           WHERE id != ? AND (identifier LIKE ? OR display_name LIKE ?)
           LIMIT 20""",
        (current_user["id"], query_str, query_str)
    )
    users = [dict(r) for r in cursor.fetchall()]
    return {"users": users}

@app.get("/api/contacts")
def get_contacts(current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        """SELECT c.id as contact_id, u.id, u.identifier, u.display_name, u.avatar_url, u.status_message, u.is_online, u.last_seen, u.safety_number
           FROM contacts c
           JOIN users u ON c.contact_user_id = u.id
           WHERE c.user_id = ?
           ORDER BY u.display_name ASC""",
        (current_user["id"],)
    )
    contacts = [dict(r) for r in cursor.fetchall()]
    return {"contacts": contacts, "users": contacts}

@app.get("/api/users/connected")
def get_connected_users(current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        """SELECT DISTINCT u.id, u.identifier, u.display_name, u.avatar_url, u.status_message, u.is_online, u.last_seen, u.safety_number
           FROM users u
           WHERE u.id != ?
             AND (
               EXISTS (
                 SELECT 1 FROM contacts c
                 WHERE c.user_id = ? AND c.contact_user_id = u.id
               )
               OR EXISTS (
                 SELECT 1
                 FROM conversation_members mine
                 JOIN conversation_members theirs
                   ON theirs.conversation_id = mine.conversation_id
                 WHERE mine.user_id = ? AND theirs.user_id = u.id
               )
             )
           ORDER BY u.display_name ASC""",
        (current_user["id"], current_user["id"], current_user["id"])
    )
    users = [dict(r) for r in cursor.fetchall()]
    return {"users": users, "contacts": users}

@app.get("/api/contacts/search")
def search_contacts(q: str = "", current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    query = f"%{q.strip()}%"
    cursor = db.cursor()
    cursor.execute(
        """SELECT DISTINCT u.id, u.identifier, u.display_name, u.avatar_url,
                  u.status_message, u.is_online, u.last_seen
           FROM users u
           WHERE u.id != ?
             AND (u.display_name LIKE ? OR u.identifier LIKE ?)
             AND (
               EXISTS (SELECT 1 FROM contacts c WHERE c.user_id = ? AND c.contact_user_id = u.id)
               OR EXISTS (
                 SELECT 1 FROM conversation_members mine
                 JOIN conversation_members theirs ON theirs.conversation_id = mine.conversation_id
                 WHERE mine.user_id = ? AND theirs.user_id = u.id
               )
             )
           ORDER BY u.display_name COLLATE NOCASE ASC LIMIT 50""",
        (current_user["id"], query, query, current_user["id"], current_user["id"])
    )
    return {"contacts": [dict(row) for row in cursor.fetchall()]}

@app.post("/api/contacts")
def add_contact(body: AddContactRequest, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    identifier = body.identifier.strip()
    cursor = db.cursor()

    cursor.execute("SELECT id, identifier, display_name, avatar_url FROM users WHERE LOWER(identifier) = LOWER(?)", (identifier,))
    target_user = cursor.fetchone()

    if not target_user:
        raise HTTPException(status_code=404, detail=f"User '{identifier}' not found.")
    
    if target_user["id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot add yourself as a contact.")

    cursor.execute(
        "INSERT OR IGNORE INTO contacts (user_id, contact_user_id) VALUES (?, ?)",
        (current_user["id"], target_user["id"])
    )
    db.commit()

    return {"status": "contact_added", "contact": dict(target_user)}

# -------------------------------------------------------------------
# CONVERSATION ENDPOINTS
# -------------------------------------------------------------------

@app.get("/api/conversations")
def list_conversations(current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    
    # Get all conversations user is a member of
    cursor.execute(
        """SELECT c.id, c.type, c.name, c.avatar_url, c.disappearing_timer, c.created_at, c.updated_at,
                  COALESCE(cp.is_favorite, 0) AS is_favorite,
                  COALESCE(cp.is_archived, 0) AS is_archived
           FROM conversations c
           JOIN conversation_members cm ON c.id = cm.conversation_id
           LEFT JOIN conversation_preferences cp ON cp.conversation_id = c.id AND cp.user_id = ?
           WHERE cm.user_id = ?
           ORDER BY COALESCE(
             (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id),
             c.updated_at
           ) DESC, c.id DESC""",
        (current_user["id"], current_user["id"])
    )
    convs = [dict(r) for r in cursor.fetchall()]

    result = []
    for conv in convs:
        cid = conv["id"]
        # Fetch members
        cursor.execute(
            """SELECT u.id, u.identifier, u.display_name, u.avatar_url, u.status_message, u.is_online, u.last_seen, u.safety_number, cm.role
               FROM conversation_members cm
               JOIN users u ON cm.user_id = u.id
               WHERE cm.conversation_id = ?""",
            (cid,)
        )
        members = [dict(m) for m in cursor.fetchall()]
        conv["members"] = members

        # If direct chat, set target user details as conversation name/avatar
        if conv["type"] == "direct":
            other_member = next((m for m in members if m["id"] != current_user["id"]), None)
            if other_member:
                conv["name"] = other_member["display_name"]
                conv["avatar_url"] = other_member["avatar_url"]
                conv["other_user"] = other_member
            else:
                conv["name"] = "Saved Messages"
                conv["avatar_url"] = current_user["avatar_url"]

        # Fetch last message
        cursor.execute(
            """SELECT m.id, m.sender_id,
                      CASE WHEN TRIM(COALESCE(m.content, '')) = ''
                           THEN COALESCE(a.file_name, 'Attachment') ELSE m.content END AS content,
                      m.status, m.is_system, m.created_at, u.display_name as sender_name
               FROM messages m
               JOIN users u ON m.sender_id = u.id
               LEFT JOIN attachments a ON a.message_id = m.id
               WHERE m.conversation_id = ?
               ORDER BY m.created_at DESC, m.id DESC LIMIT 1""",
            (cid,)
        )
        last_msg = cursor.fetchone()
        conv["last_message"] = dict(last_msg) if last_msg else None
        if last_msg and last_msg["created_at"]:
            conv["updated_at"] = last_msg["created_at"]

        # Fetch unread count
        cursor.execute(
            """SELECT COUNT(*) as count FROM messages m
               WHERE m.conversation_id = ? AND m.sender_id != ?
                 AND (m.expires_at IS NULL OR m.expires_at > ?)
                 AND NOT EXISTS (
                   SELECT 1 FROM message_reads mr
                   WHERE mr.message_id = m.id AND mr.user_id = ?
                 )""",
            (cid, current_user["id"], datetime.utcnow().isoformat(), current_user["id"])
        )
        conv["unread_count"] = cursor.fetchone()["count"]

        result.append(conv)

    return {"conversations": result}

@app.patch("/api/conversations/{conv_id}/preferences")
def update_conversation_preferences(conv_id: int, body: dict = Body(...), current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    allowed = {"is_favorite", "is_archived"}
    if not body or any(key not in allowed or not isinstance(value, bool) for key, value in body.items()):
        raise HTTPException(status_code=400, detail="Provide boolean is_favorite and/or is_archived values")

    cursor = db.cursor()
    cursor.execute(
        "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
        (conv_id, current_user["id"])
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Conversation not found")

    cursor.execute(
        "INSERT OR IGNORE INTO conversation_preferences (conversation_id, user_id) VALUES (?, ?)",
        (conv_id, current_user["id"])
    )
    assignments = ", ".join(f"{key} = ?" for key in body)
    cursor.execute(
        f"UPDATE conversation_preferences SET {assignments} WHERE conversation_id = ? AND user_id = ?",
        (*body.values(), conv_id, current_user["id"])
    )
    db.commit()
    row = cursor.execute(
        "SELECT is_favorite, is_archived FROM conversation_preferences WHERE conversation_id = ? AND user_id = ?",
        (conv_id, current_user["id"])
    ).fetchone()
    return {"preferences": dict(row)}

@app.post("/api/conversations/direct")
def create_direct_conversation(body: CreateDirectConversationRequest, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    contact_id = body.contact_user_id
    if contact_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot start a direct conversation with yourself")
    cursor = db.cursor()

    cursor.execute("SELECT 1 FROM users WHERE id = ?", (contact_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="User not found")

    # Check if direct conversation already exists between these two users
    cursor.execute(
        """SELECT c.id FROM conversations c
           JOIN conversation_members cm1 ON c.id = cm1.conversation_id
           JOIN conversation_members cm2 ON c.id = cm2.conversation_id
           WHERE c.type = 'direct' AND cm1.user_id = ? AND cm2.user_id = ?""",
        (current_user["id"], contact_id)
    )
    existing = cursor.fetchone()
    if existing:
        return {"conversation_id": existing["id"]}

    now_iso = datetime.utcnow().isoformat()
    cursor.execute("SELECT default_disappearing_timer FROM user_preferences WHERE user_id = ?", (current_user["id"],))
    default_timer = cursor.fetchone()
    default_timer = default_timer["default_disappearing_timer"] if default_timer else 0
    cursor.execute(
        "INSERT INTO conversations (type, disappearing_timer, created_at, updated_at) VALUES ('direct', ?, ?, ?)",
        (default_timer, now_iso, now_iso)
    )
    conv_id = cursor.lastrowid

    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)", (conv_id, current_user["id"]))
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)", (conv_id, contact_id))
    db.commit()

    return {"conversation_id": conv_id}

@app.post("/api/conversations/group")
def create_group_conversation(body: CreateGroupConversationRequest, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required.")

    member_ids = list(set(body.member_user_ids + [current_user["id"]]))
    avatar_url = body.avatar_url or f"https://api.dicebear.com/7.x/identicon/svg?seed={name}"
    now_iso = datetime.utcnow().isoformat()

    cursor = db.cursor()
    cursor.execute("SELECT default_disappearing_timer FROM user_preferences WHERE user_id = ?", (current_user["id"],))
    default_timer = cursor.fetchone()
    default_timer = default_timer["default_disappearing_timer"] if default_timer else 0
    cursor.execute(
        "INSERT INTO conversations (type, name, avatar_url, disappearing_timer, created_at, updated_at) VALUES ('group', ?, ?, ?, ?, ?)",
        (name, avatar_url, default_timer, now_iso, now_iso)
    )
    conv_id = cursor.lastrowid

    for uid in member_ids:
        role = "admin" if uid == current_user["id"] else "member"
        cursor.execute(
            "INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)",
            (conv_id, uid, role)
        )

    # Insert system message
    cursor.execute(
        "INSERT INTO messages (conversation_id, sender_id, content, is_system, created_at) VALUES (?, ?, ?, 1, ?)",
        (conv_id, current_user["id"], f"{current_user['display_name']} created the group '{name}'", now_iso)
    )

    db.commit()
    return {"conversation_id": conv_id}

@app.post("/api/conversations/{conv_id}/disappearing")
def set_disappearing_timer(conv_id: int, body: SetDisappearingTimerRequest, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    timer_sec = body.disappearing_timer
    cursor = db.cursor()
    cursor.execute("UPDATE conversations SET disappearing_timer = ? WHERE id = ?", (timer_sec, conv_id))
    
    timer_text = "off" if timer_sec == 0 else f"{timer_sec} seconds" if timer_sec < 60 else f"{timer_sec // 60} minutes" if timer_sec < 3600 else f"{timer_sec // 3600} hours"
    
    # System message
    now_iso = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO messages (conversation_id, sender_id, content, is_system, created_at) VALUES (?, ?, ?, 1, ?)",
        (conv_id, current_user["id"], f"{current_user['display_name']} set disappearing messages to {timer_text}", now_iso)
    )
    db.commit()

    return {"status": "success", "disappearing_timer": timer_sec}

@app.post("/api/conversations/{conv_id}/members")
def add_group_member(conv_id: int, body: GroupMemberUpdate, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    user_to_add = body.user_id
    cursor = db.cursor()

    cursor.execute(
        """SELECT c.type, cm.role
           FROM conversations c
           JOIN conversation_members cm ON cm.conversation_id = c.id
           WHERE c.id = ? AND cm.user_id = ?""",
        (conv_id, current_user["id"])
    )
    actor_membership = cursor.fetchone()
    if not actor_membership:
        raise HTTPException(status_code=404, detail="Group not found")
    if actor_membership["type"] != "group":
        raise HTTPException(status_code=400, detail="Members can only be managed in group conversations")
    if actor_membership["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only the group creator can add members")

    cursor.execute("SELECT display_name FROM users WHERE id = ?", (user_to_add,))
    target_user = cursor.fetchone()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    cursor.execute(
        "INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')",
        (conv_id, user_to_add)
    )
    now_iso = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO messages (conversation_id, sender_id, content, is_system, created_at) VALUES (?, ?, ?, 1, ?)",
        (conv_id, current_user["id"], f"{current_user['display_name']} added {target_user['display_name']} to the group", now_iso)
    )
    db.commit()

    return {"status": "member_added"}

@app.delete("/api/conversations/{conv_id}/members/{user_id}")
def remove_group_member(conv_id: int, user_id: int, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute(
        """SELECT c.type, cm.role
           FROM conversations c
           JOIN conversation_members cm ON cm.conversation_id = c.id
           WHERE c.id = ? AND cm.user_id = ?""",
        (conv_id, current_user["id"])
    )
    actor_membership = cursor.fetchone()
    if not actor_membership:
        raise HTTPException(status_code=404, detail="Group not found")
    if actor_membership["type"] != "group":
        raise HTTPException(status_code=400, detail="Members can only be managed in group conversations")
    if actor_membership["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only the group creator can remove members")
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="The group creator cannot remove themselves")

    cursor.execute("SELECT display_name FROM users WHERE id = ?", (user_id,))
    target_user = cursor.fetchone()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    cursor.execute("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", (conv_id, user_id))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="User is not a member of this group")

    cursor.execute("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", (conv_id, user_id))
    
    if target_user:
        now_iso = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO messages (conversation_id, sender_id, content, is_system, created_at) VALUES (?, ?, ?, 1, ?)",
            (conv_id, current_user["id"], f"{target_user['display_name']} was removed from the group", now_iso)
        )
    db.commit()

    return {"status": "member_removed"}

# -------------------------------------------------------------------
# MESSAGES & REACTIONS ENDPOINTS
# -------------------------------------------------------------------

def refresh_message_status(cursor: sqlite3.Cursor, message_id: int) -> str:
    """Set a message's aggregate status from every other conversation member's receipts."""
    cursor.execute("SELECT 1 FROM messages WHERE id = ?", (message_id,))
    message = cursor.fetchone()
    if not message:
        return "sent"

    cursor.execute("SELECT COUNT(*) AS count FROM message_recipients WHERE message_id = ?", (message_id,))
    recipient_count = cursor.fetchone()["count"]
    if recipient_count == 0:
        return "sent"

    cursor.execute(
        """SELECT COUNT(*) AS count FROM message_recipients recipient
           LEFT JOIN user_preferences preference ON preference.user_id = recipient.user_id
           WHERE recipient.message_id = ? AND COALESCE(preference.read_receipts_enabled, 1) = 1""",
        (message_id,)
    )
    read_receipt_recipient_count = cursor.fetchone()["count"]

    cursor.execute(
        """SELECT COUNT(*) AS count FROM message_recipients recipient
           LEFT JOIN user_preferences preference ON preference.user_id = recipient.user_id
           WHERE recipient.message_id = ?
             AND COALESCE(preference.read_receipts_enabled, 1) = 1
             AND EXISTS (
               SELECT 1 FROM message_reads receipt
               WHERE receipt.message_id = recipient.message_id AND receipt.user_id = recipient.user_id
             )""",
        (message_id,)
    )
    read_count = cursor.fetchone()["count"]

    cursor.execute(
        """SELECT COUNT(*) AS count FROM message_recipients recipient
           WHERE recipient.message_id = ?
             AND (
               EXISTS (
                 SELECT 1 FROM message_deliveries receipt
                 WHERE receipt.message_id = recipient.message_id AND receipt.user_id = recipient.user_id
               )
               OR EXISTS (
                 SELECT 1 FROM message_reads receipt
                 WHERE receipt.message_id = recipient.message_id AND receipt.user_id = recipient.user_id
               )
             )""",
        (message_id,)
    )
    delivered_count = cursor.fetchone()["count"]

    status_value = (
        "read" if read_receipt_recipient_count > 0 and read_count == read_receipt_recipient_count
        else "delivered" if delivered_count == recipient_count
        else "sent"
    )
    cursor.execute("UPDATE messages SET status = ? WHERE id = ?", (status_value, message_id))
    return status_value

@app.get("/api/conversations/{conv_id}/messages")
def get_messages(conv_id: int, limit: int = 50, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    
    # Check if user is member
    cursor.execute("SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?", (conv_id, current_user["id"]))
    if not cursor.fetchone():
        raise HTTPException(status_code=403, detail="Not a member of this conversation")

    cursor.execute(
        """SELECT m.id, m.conversation_id, m.sender_id, m.content, m.reply_to_id, m.status, m.is_system, m.expires_at, m.created_at,
                  u.display_name as sender_name, u.avatar_url as sender_avatar
           FROM messages m
           JOIN users u ON m.sender_id = u.id
           WHERE m.conversation_id = ?
             AND (m.expires_at IS NULL OR m.expires_at > ?)
           ORDER BY m.id DESC
           LIMIT ?""",
        (conv_id, datetime.utcnow().isoformat(), max(1, min(limit, 200)))
    )
    # Select the newest page, then show it in chronological order.
    messages = [dict(r) for r in reversed(cursor.fetchall())]

    for msg in messages:
        mid = msg["id"]

        # Fetch attachments
        cursor.execute("SELECT id, file_path, file_name, file_type, file_size FROM attachments WHERE message_id = ?", (mid,))
        msg["attachments"] = [dict(a) for a in cursor.fetchall()]

        # Fetch reactions
        cursor.execute(
            """SELECT mr.id, mr.emoji, mr.user_id, u.display_name
               FROM message_reactions mr
               JOIN users u ON mr.user_id = u.id
               WHERE mr.message_id = ?""",
            (mid,)
        )
        msg["reactions"] = [dict(r) for r in cursor.fetchall()]

        # Fetch replied message if reply_to_id
        if msg["reply_to_id"]:
            cursor.execute(
                """SELECT m.id, m.content, u.display_name as sender_name
                   FROM messages m
                   JOIN users u ON m.sender_id = u.id
                   WHERE m.id = ?""",
                (msg["reply_to_id"],)
            )
            reply = cursor.fetchone()
            msg["reply_to"] = dict(reply) if reply else None

    return {"messages": messages}

@app.post("/api/conversations/{conv_id}/messages")
async def send_message(conv_id: int, body: SendMessageRequest, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    now_iso = datetime.utcnow().isoformat()

    if body.conversation_id is not None and body.conversation_id != conv_id:
        raise HTTPException(status_code=400, detail="Conversation ID does not match the request URL")

    cursor.execute(
        "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
        (conv_id, current_user["id"])
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=403, detail="Not a member of this conversation")

    if body.reply_to_id is not None:
        cursor.execute(
            "SELECT id FROM messages WHERE id = ? AND conversation_id = ?",
            (body.reply_to_id, conv_id)
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Message to reply to was not found in this conversation")

    # Get conversation disappearing timer
    cursor.execute("SELECT disappearing_timer FROM conversations WHERE id = ?", (conv_id,))
    conv = cursor.fetchone()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    timer_sec = conv["disappearing_timer"]
    expires_at = (datetime.utcnow() + timedelta(seconds=timer_sec)).isoformat() if timer_sec > 0 else None

    cursor.execute(
        """INSERT INTO messages (conversation_id, sender_id, content, reply_to_id, status, expires_at, created_at)
           VALUES (?, ?, ?, ?, 'sent', ?, ?)""",
        (conv_id, current_user["id"], body.content, body.reply_to_id, expires_at, now_iso)
    )
    msg_id = cursor.lastrowid

    cursor.execute("SELECT user_id FROM conversation_members WHERE conversation_id = ?", (conv_id,))
    member_ids = [row["user_id"] for row in cursor.fetchall()]
    recipient_ids = [member_id for member_id in member_ids if member_id != current_user["id"]]
    for recipient_id in recipient_ids:
        cursor.execute(
            "INSERT OR IGNORE INTO message_recipients (message_id, user_id) VALUES (?, ?)",
            (msg_id, recipient_id)
        )

    # If attachment included
    if body.attachment_url:
        cursor.execute(
            "INSERT INTO attachments (message_id, file_path, file_name, file_type, file_size) VALUES (?, ?, ?, ?, ?)",
            (msg_id, body.attachment_url, body.attachment_name or "Attachment", body.attachment_type or "file", 1024)
        )

    # Update conversation updated_at
    cursor.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now_iso, conv_id))
    db.commit()

    # Get inserted message
    cursor.execute(
        """SELECT m.id, m.conversation_id, m.sender_id, m.content, m.reply_to_id, m.status, m.is_system, m.expires_at, m.created_at,
                  u.display_name as sender_name, u.avatar_url as sender_avatar
           FROM messages m
           JOIN users u ON m.sender_id = u.id
           WHERE m.id = ?""",
        (msg_id,)
    )
    msg_data = dict(cursor.fetchone())
    msg_data["reply_to"] = None
    if msg_data["reply_to_id"] is not None:
        cursor.execute(
            """SELECT m.id, m.content, u.display_name AS sender_name
               FROM messages m
               JOIN users u ON u.id = m.sender_id
               WHERE m.id = ? AND m.conversation_id = ?""",
            (msg_data["reply_to_id"], conv_id)
        )
        reply = cursor.fetchone()
        msg_data["reply_to"] = dict(reply) if reply else None

    msg_data["attachments"] = []
    if body.attachment_url:
        msg_data["attachments"].append({
            "file_path": body.attachment_url,
            "file_name": body.attachment_name or "Attachment",
            "file_type": body.attachment_type or "file",
            "file_size": 1024
        })
    msg_data["reactions"] = []

    delivered_ids = await manager.broadcast_to_users(member_ids, {
        "type": "new_message",
        "conversation_id": conv_id,
        "message": msg_data
    })

    delivered_recipients = delivered_ids - {current_user["id"]}
    if delivered_recipients:
        delivered_at = datetime.utcnow().isoformat()
        for recipient_id in delivered_recipients:
            cursor.execute(
                "INSERT OR IGNORE INTO message_deliveries (message_id, user_id, delivered_at) VALUES (?, ?, ?)",
                (msg_id, recipient_id, delivered_at)
            )
        msg_status = refresh_message_status(cursor, msg_id)
        db.commit()
        await manager.broadcast_to_users(member_ids, {
            "type": "message_status",
            "conversation_id": conv_id,
            "statuses": {str(msg_id): msg_status}
        })

    return {"message": msg_data}

@app.post("/api/messages/{message_id}/reactions")
async def toggle_reaction(message_id: int, body: ReactionRequest, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    emoji = body.emoji.strip()
    if not emoji or len(emoji) > 16:
        raise HTTPException(status_code=400, detail="A valid emoji reaction is required")
    cursor = db.cursor()

    cursor.execute("SELECT conversation_id FROM messages WHERE id = ?", (message_id,))
    msg = cursor.fetchone()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    conv_id = msg["conversation_id"]

    cursor.execute(
        "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
        (conv_id, current_user["id"])
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=403, detail="You are not a member of this conversation")

    cursor.execute("SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", (message_id, current_user["id"], emoji))
    existing = cursor.fetchone()
    if existing:
        cursor.execute("DELETE FROM message_reactions WHERE id = ?", (existing["id"],))
    else:
        cursor.execute("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)", (message_id, current_user["id"], emoji))
    db.commit()

    # Get updated reactions
    cursor.execute(
        """SELECT mr.id, mr.emoji, mr.user_id, u.display_name
           FROM message_reactions mr
           JOIN users u ON mr.user_id = u.id
           WHERE mr.message_id = ?""",
        (message_id,)
    )
    reactions = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT user_id FROM conversation_members WHERE conversation_id = ?", (conv_id,))
    member_ids = [r["user_id"] for r in cursor.fetchall()]

    await manager.broadcast_to_users(member_ids, {
        "type": "reaction_update",
        "conversation_id": conv_id,
        "message_id": message_id,
        "reactions": reactions
    })

    return {"reactions": reactions}

@app.post("/api/conversations/{conv_id}/read")
async def mark_read(conv_id: int, current_user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", (conv_id, current_user["id"]))
    if not cursor.fetchone():
        raise HTTPException(status_code=403, detail="Not a member of this conversation")
    now_iso = datetime.utcnow().isoformat()
    cursor.execute(
        """SELECT id FROM messages
           WHERE conversation_id = ? AND sender_id != ?
             AND (expires_at IS NULL OR expires_at > ?)""",
        (conv_id, current_user["id"], now_iso)
    )
    message_ids = [row["id"] for row in cursor.fetchall()]
    for message_id in message_ids:
        cursor.execute(
            "INSERT OR IGNORE INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?)",
            (message_id, current_user["id"], now_iso)
        )
        cursor.execute(
            "INSERT OR IGNORE INTO message_deliveries (message_id, user_id, delivered_at) VALUES (?, ?, ?)",
            (message_id, current_user["id"], now_iso)
        )
    statuses = {str(message_id): refresh_message_status(cursor, message_id) for message_id in message_ids}
    cursor.execute("INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)", (current_user["id"],))
    cursor.execute(
        "SELECT COALESCE(read_receipts_enabled, 1) AS enabled FROM user_preferences WHERE user_id = ?",
        (current_user["id"],)
    )
    read_receipts_enabled = cursor.fetchone()["enabled"]
    db.commit()

    cursor.execute("SELECT user_id FROM conversation_members WHERE conversation_id = ?", (conv_id,))
    member_ids = [r["user_id"] for r in cursor.fetchall()]

    if message_ids and read_receipts_enabled:
        await manager.broadcast_to_users(member_ids, {
            "type": "messages_read",
            "conversation_id": conv_id,
            "read_by_user_id": current_user["id"],
            "message_ids": message_ids,
            "statuses": statuses
        })

    return {"status": "read_marked"}

# -------------------------------------------------------------------
# FILE UPLOAD ENDPOINT
# -------------------------------------------------------------------

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = UPLOADS_DIR / unique_name

    with dest_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_url = f"http://localhost:8000/uploads/{unique_name}"
    file_type = "image" if file.content_type.startswith("image/") else "audio" if file.content_type.startswith("audio/") else "video" if file.content_type.startswith("video/") else "file"

    return {
        "url": file_url,
        "filename": file.filename,
        "type": file_type
    }

# -------------------------------------------------------------------
# WEBSOCKET REAL-TIME ENGINE
# -------------------------------------------------------------------

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    token = websocket.cookies.get(COOKIE_NAME)
    if not token:
        await websocket.close(code=4401)
        return

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT user_id FROM sessions WHERE session_hash = ? AND expires_at > ?",
        (hash_token(token), datetime.utcnow().isoformat())
    )
    session = cursor.fetchone()
    if not session or session["user_id"] != user_id:
        conn.close()
        await websocket.close(code=4401)
        return

    was_online = manager.is_connected(user_id)
    await manager.connect(user_id, websocket)
    cursor.execute("UPDATE users SET is_online = 1 WHERE id = ?", (user_id,))

    # Mark messages queued while this user was offline as delivered on reconnect.
    cursor.execute(
        """SELECT m.id, m.conversation_id FROM messages m
           JOIN message_recipients mr ON mr.message_id = m.id
           WHERE mr.user_id = ? AND m.sender_id != ?
             AND (m.expires_at IS NULL OR m.expires_at > ?)
             AND NOT EXISTS (
               SELECT 1 FROM message_deliveries md
               WHERE md.message_id = m.id AND md.user_id = ?
             )""",
        (user_id, user_id, datetime.utcnow().isoformat(), user_id)
    )
    pending_deliveries = cursor.fetchall()
    now_iso = datetime.utcnow().isoformat()
    changed_statuses: dict[int, dict[str, str]] = {}
    for pending in pending_deliveries:
        cursor.execute(
            "INSERT OR IGNORE INTO message_deliveries (message_id, user_id, delivered_at) VALUES (?, ?, ?)",
            (pending["id"], user_id, now_iso)
        )
        status_value = refresh_message_status(cursor, pending["id"])
        changed_statuses.setdefault(pending["conversation_id"], {})[str(pending["id"])] = status_value
    conn.commit()
    conn.close()

    if not was_online:
        await manager.broadcast_all({"type": "user_presence", "user_id": user_id, "is_online": True})
    for conversation_id, statuses in changed_statuses.items():
        c = get_db_connection()
        recipients = [row["user_id"] for row in c.execute(
            "SELECT user_id FROM conversation_members WHERE conversation_id = ?", (conversation_id,)
        ).fetchall()]
        c.close()
        await manager.broadcast_to_users(recipients, {
            "type": "message_status", "conversation_id": conversation_id, "statuses": statuses
        })

    try:
        while True:
            try:
                data = json.loads(await websocket.receive_text())
            except json.JSONDecodeError:
                continue
            event_type = data.get("type")

            if event_type == "typing":
                conv_id = data.get("conversation_id")
                is_typing = data.get("is_typing", False)
                
                # Fetch members
                c = get_db_connection()
                cur = c.cursor()
                cur.execute("SELECT user_id FROM conversation_members WHERE conversation_id = ?", (conv_id,))
                members = [r["user_id"] for r in cur.fetchall()]
                m_ids = [member_id for member_id in members if member_id != user_id]
                c.close()

                if user_id not in members:
                    continue

                await manager.broadcast_to_users(m_ids, {
                    "type": "typing_status",
                    "conversation_id": conv_id,
                    "user_id": user_id,
                    "is_typing": is_typing
                })

            elif event_type == "call_signal":
                target_user_id = data.get("target_user_id")
                signal_type = data.get("signal_type") # 'offer', 'answer', 'ice', 'end_call'
                payload = data.get("payload")

                await manager.send_personal_message(target_user_id, {
                    "type": "call_signal",
                    "from_user_id": user_id,
                    "signal_type": signal_type,
                    "payload": payload
                })

    except WebSocketDisconnect:
        pass
    finally:
        still_online = manager.disconnect(user_id, websocket)
        if not still_online:
            last_seen = datetime.utcnow().isoformat()
            c = get_db_connection()
            c.execute("UPDATE users SET is_online = 0, last_seen = ? WHERE id = ?", (last_seen, user_id))
            c.commit()
            c.close()
            await manager.broadcast_all({
                "type": "user_presence", "user_id": user_id,
                "is_online": False, "last_seen": last_seen
            })
