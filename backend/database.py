import sqlite3
import os
from pathlib import Path

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "signal.db"
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")

    # Auto-repair sessions table if old schema exists (token instead of session_hash)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions';")
    if cursor.fetchone():
        cursor.execute("PRAGMA table_info(sessions);")
        session_cols = {col["name"] for col in cursor.fetchall()}
        if "session_hash" not in session_cols:
            print("Upgrading 'sessions' table schema to include session_hash...")
            cursor.execute("DROP TABLE sessions;")

    # Sessions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_hash TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identifier TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT DEFAULT NULL,
        status_message TEXT DEFAULT 'Available',
        is_online BOOLEAN DEFAULT 0,
        last_seen TIMESTAMP DEFAULT NULL,
        safety_number TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Check and migrate columns for 'users' table
    cursor.execute("PRAGMA table_info(users);")
    existing_user_cols = {col["name"] for col in cursor.fetchall()}

    user_migrations = [
        ("avatar_url", "TEXT DEFAULT NULL"),
        ("status_message", "TEXT DEFAULT 'Available'"),
        ("is_online", "BOOLEAN DEFAULT 0"),
        ("last_seen", "TIMESTAMP DEFAULT NULL"),
        ("safety_number", "TEXT DEFAULT NULL"),
    ]

    for col_name, col_def in user_migrations:
        if col_name not in existing_user_cols:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def};")
            except Exception as e:
                print(f"Migration notice for {col_name}: {e}")

    # Usernames (stored in identifier) are unique regardless of letter case.
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_identifier_nocase ON users(LOWER(identifier));")

    # Contacts Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        contact_user_id INTEGER NOT NULL,
        nickname TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, contact_user_id)
    );
    """)

    # Conversations Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL, -- 'direct' or 'group'
        name TEXT DEFAULT NULL,
        avatar_url TEXT DEFAULT NULL,
        disappearing_timer INTEGER DEFAULT 0, -- 0 = off, 5, 30, 60, 3600, 86400, 604800 seconds
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Check and migrate columns for 'conversations' table if needed
    cursor.execute("PRAGMA table_info(conversations);")
    existing_conv_cols = {col["name"] for col in cursor.fetchall()}

    conv_migrations = [
        ("name", "TEXT DEFAULT NULL"),
        ("avatar_url", "TEXT DEFAULT NULL"),
        ("disappearing_timer", "INTEGER DEFAULT 0"),
        ("updated_at", "TIMESTAMP DEFAULT NULL"),
    ]

    for col_name, col_def in conv_migrations:
        if col_name not in existing_conv_cols:
            try:
                cursor.execute(f"ALTER TABLE conversations ADD COLUMN {col_name} {col_def};")
            except Exception as e:
                print(f"Migration notice for {col_name}: {e}")

    # Conversation Members Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversation_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT DEFAULT 'member', -- 'admin' or 'member'
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(conversation_id, user_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversation_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        is_favorite BOOLEAN NOT NULL DEFAULT 0,
        is_archived BOOLEAN NOT NULL DEFAULT 0,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(conversation_id, user_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_preferences (
        user_id INTEGER PRIMARY KEY,
        read_receipts_enabled BOOLEAN NOT NULL DEFAULT 1,
        notifications_enabled BOOLEAN NOT NULL DEFAULT 1,
        default_disappearing_timer INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    preference_columns = {row["name"] for row in cursor.execute("PRAGMA table_info(user_preferences)").fetchall()}
    if "default_disappearing_timer" not in preference_columns:
        cursor.execute("ALTER TABLE user_preferences ADD COLUMN default_disappearing_timer INTEGER NOT NULL DEFAULT 0")

    # Messages Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        content TEXT DEFAULT '',
        reply_to_id INTEGER DEFAULT NULL,
        status TEXT DEFAULT 'sent', -- 'sending', 'sent', 'delivered', 'read'
        is_system BOOLEAN DEFAULT 0,
        expires_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
    );
    """)

    # Check and migrate columns for 'messages' table if needed
    cursor.execute("PRAGMA table_info(messages);")
    existing_msg_cols = {col["name"] for col in cursor.fetchall()}

    msg_migrations = [
        ("reply_to_id", "INTEGER DEFAULT NULL"),
        ("status", "TEXT DEFAULT 'sent'"),
        ("is_system", "BOOLEAN DEFAULT 0"),
        ("expires_at", "TIMESTAMP DEFAULT NULL"),
    ]

    for col_name, col_def in msg_migrations:
        if col_name not in existing_msg_cols:
            try:
                cursor.execute(f"ALTER TABLE messages ADD COLUMN {col_name} {col_def};")
            except Exception as e:
                print(f"Migration notice for {col_name}: {e}")

    # Attachments Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL, -- 'image', 'video', 'audio', 'file'
        file_size INTEGER NOT NULL,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
    """)

    # Message Reactions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS message_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(message_id, user_id, emoji)
    );
    """)

    # Message Reads Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS message_reads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(message_id, user_id)
    );
    """)

    # Per-recipient delivery receipts keep direct and group status accurate.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS message_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(message_id, user_id)
    );
    """)

    # Snapshot who was in the conversation when each message was sent.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS message_recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(message_id, user_id)
    );
    """)

    # Backfill existing messages once; subsequent group membership changes do not
    # alter the recipient set for messages that have already been sent.
    cursor.execute(
        """INSERT OR IGNORE INTO message_recipients (message_id, user_id)
           SELECT m.id, cm.user_id
           FROM messages m
           JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
           WHERE cm.user_id != m.sender_id
             AND NOT EXISTS (
               SELECT 1 FROM message_recipients mr WHERE mr.message_id = m.id
             )"""
    )

    conn.commit()
    conn.close()
