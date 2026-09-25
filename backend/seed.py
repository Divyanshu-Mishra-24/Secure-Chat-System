import sqlite3
import random
import hashlib
from datetime import datetime, timedelta

def generate_safety_number(id1: int, id2: int) -> str:
    # Generates a deterministic Signal 60-digit safety number format (12 blocks of 5 digits)
    combined = f"SIGNAL-SAFETY-NUMBER-V1-{min(id1, id2)}-{max(id1, id2)}"
    h = hashlib.sha256(combined.encode()).hexdigest()
    numbers = ''.join(str(int(c, 16) % 10) for c in h * 3)[:60]
    return ' '.join([numbers[i:i+5] for i in range(0, 60, 5)])

def seed_database(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Check if users already exist
    cursor.execute("SELECT COUNT(*) as count FROM users")
    if cursor.fetchone()['count'] > 0:
        conn.close()
        return

    print("Seeding initial Signal clone database...")

    # Insert Users
    users_data = [
        ("+15550100", "Alex Morgan", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150", "Signal Core Team 🚀", True),
        ("+15550101", "Sarah Connor", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150", "Encrypted & Offline 🔒", True),
        ("+15550102", "Marcus Chen", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", "Building fast APIs ⚡", True),
        ("+15550103", "Elena Rostova", "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150", "Privacy first, always.", False),
        ("+15550104", "David Kim", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", "Testing WebSockets 🔌", True),
    ]

    user_ids = []
    for identifier, display_name, avatar, status_msg, online in users_data:
        safety_no = generate_safety_number(1, len(user_ids) + 1)
        cursor.execute(
            """INSERT INTO users (identifier, display_name, avatar_url, status_message, is_online, safety_number, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (identifier, display_name, avatar, status_msg, 1 if online else 0, safety_no, datetime.utcnow().isoformat())
        )
        user_ids.append(cursor.lastrowid)

    alex_id = user_ids[0]
    sarah_id = user_ids[1]
    marcus_id = user_ids[2]
    elena_id = user_ids[3]
    david_id = user_ids[4]

    # Add Contacts for Alex
    for cid in [sarah_id, marcus_id, elena_id, david_id]:
        cursor.execute("INSERT INTO contacts (user_id, contact_user_id) VALUES (?, ?)", (alex_id, cid))
        cursor.execute("INSERT INTO contacts (user_id, contact_user_id) VALUES (?, ?)", (cid, alex_id))

    # Add 1-on-1 Conversation with Sarah
    now = datetime.utcnow()
    cursor.execute("INSERT INTO conversations (type, disappearing_timer, created_at, updated_at) VALUES ('direct', 0, ?, ?)",
                   (now - timedelta(days=2), now - timedelta(minutes=5)))
    conv_sarah_id = cursor.lastrowid
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)", (conv_sarah_id, alex_id))
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)", (conv_sarah_id, sarah_id))

    # Messages with Sarah
    sarah_msgs = [
        (sarah_id, "Hey Alex! Welcome to the new Signal desktop interface 💙", now - timedelta(hours=3), 'read'),
        (alex_id, "Hey Sarah! Wow, the real-time WebSocket messaging and design feel super responsive.", now - timedelta(hours=2, minutes=50), 'read'),
        (sarah_id, "Did you check out the safety numbers and end-to-end encryption indicators?", now - timedelta(hours=1, minutes=30), 'read'),
        (alex_id, "Yes! All verified. Safety numbers match 100%.", now - timedelta(minutes=10), 'read'),
        (sarah_id, "Awesome. Let's start testing group chats and disappearing messages next!", now - timedelta(minutes=5), 'read'),
    ]
    for sender, text, ts, status in sarah_msgs:
        cursor.execute(
            "INSERT INTO messages (conversation_id, sender_id, content, status, created_at) VALUES (?, ?, ?, ?, ?)",
            (conv_sarah_id, sender, text, status, ts)
        )

    # Add 1-on-1 Conversation with Marcus
    cursor.execute("INSERT INTO conversations (type, disappearing_timer, created_at, updated_at) VALUES ('direct', 30, ?, ?)",
                   (now - timedelta(days=1), now - timedelta(minutes=20)))
    conv_marcus_id = cursor.lastrowid
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)", (conv_marcus_id, alex_id))
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)", (conv_marcus_id, marcus_id))

    marcus_msgs = [
        (marcus_id, "Alex, I activated disappearing messages (30s) on our thread.", now - timedelta(minutes=45), 'read'),
        (alex_id, "Nice! FastAPI + WebSockets handles real-time sync seamlessly.", now - timedelta(minutes=25), 'read'),
        (marcus_id, "Let me know when you're ready for code review.", now - timedelta(minutes=20), 'read'),
    ]
    for sender, text, ts, status in marcus_msgs:
        cursor.execute(
            "INSERT INTO messages (conversation_id, sender_id, content, status, created_at) VALUES (?, ?, ?, ?, ?)",
            (conv_marcus_id, sender, text, status, ts)
        )

    # Add Group Conversation: "⚡ Signal Core Engineering"
    cursor.execute(
        """INSERT INTO conversations (type, name, avatar_url, disappearing_timer, created_at, updated_at)
           VALUES ('group', '⚡ Signal Core Engineering', 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150', 0, ?, ?)""",
        (now - timedelta(days=5), now - timedelta(minutes=2))
    )
    group_id = cursor.lastrowid
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'admin')", (group_id, alex_id))
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", (group_id, sarah_id))
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", (group_id, marcus_id))
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", (group_id, elena_id))
    cursor.execute("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')", (group_id, david_id))

    group_msgs = [
        (alex_id, "Welcome team to the Signal Core group chat!", now - timedelta(hours=5), 'read', False),
        (elena_id, "Encryption parameters verified across all 5 nodes 🛡️", now - timedelta(hours=4), 'read', False),
        (david_id, "WebSocket heartbeat looks solid. Zero dropped frames.", now - timedelta(hours=2), 'read', False),
        (sarah_id, "The UI matches Signal's desktop specs perfectly.", now - timedelta(minutes=15), 'read', False),
        (alex_id, "Awesome work everyone! Ready for deployment.", now - timedelta(minutes=2), 'read', False),
    ]
    for sender, text, ts, status, is_sys in group_msgs:
        cursor.execute(
            "INSERT INTO messages (conversation_id, sender_id, content, status, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (group_id, sender, text, status, 1 if is_sys else 0, ts)
        )

    # Insert a sample reaction
    cursor.execute("SELECT id FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", (group_id,))
    last_g_msg = cursor.fetchone()
    if last_g_msg:
        cursor.execute("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, '❤️')", (last_g_msg['id'], sarah_id))
        cursor.execute("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, '🔥')", (last_g_msg['id'], marcus_id))

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
    print("Database successfully seeded!")

if __name__ == "__main__":
    import Path
    db_file = Path(__file__).parent / "signal.db"
    seed_database(db_file)
