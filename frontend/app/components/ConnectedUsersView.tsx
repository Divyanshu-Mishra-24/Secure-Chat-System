"use client";

import { useState } from "react";
import { Search, MessageSquare, ShieldCheck, UserPlus, Phone, CheckCircle, Sparkles } from "lucide-react";
import { formatKolkataShortDate, formatKolkataTime, isSameKolkataDay, parseProjectTimestamp } from "../utils/dateTime";

interface ConnectedUsersViewProps {
  contacts: any[];
  onStartChat: (userId: number) => void;
  onOpenSafetyNumber: (user: any) => void;
  onOpenAddContact: () => void;
}

export default function ConnectedUsersView({
  contacts,
  onStartChat,
  onOpenSafetyNumber,
  onOpenAddContact,
}: ConnectedUsersViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = contacts.filter(
    (u) =>
      u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.identifier?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function presenceLabel(user: any) {
    if (user.is_online) return "Online";
    if (!user.last_seen) return "Offline";
    const lastSeen = parseProjectTimestamp(user.last_seen);
    if (!lastSeen) return "Offline";
    const when = isSameKolkataDay(lastSeen, new Date())
      ? formatKolkataTime(user.last_seen)
      : formatKolkataShortDate(user.last_seen);
    return `Last seen ${when}`;
  }

  return (
    <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-dark)", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ padding: "20px 32px", background: "var(--panel-header-bg)", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>Connected Network</h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 2 }}>
            Contacts connected with you ({filtered.length} total)
          </p>
        </div>

        <button className="btn-primary" style={{ width: "auto" }} onClick={onOpenAddContact}>
          <UserPlus size={18} /> Add New Contact
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ padding: "16px 32px", background: "var(--panel-bg)", borderBottom: "1px solid var(--border-color)" }}>
        <div className="search-box" style={{ maxWidth: 480 }}>
          <Search size={16} />
          <input
            className="search-input"
            type="text"
            placeholder="Search connected users by name or phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Users List Grid */}
      <div style={{ padding: "24px 32px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
            No connected users found.
          </div>
        ) : (
          filtered.map((user) => (
            <div
              key={user.id}
              style={{
                background: "var(--panel-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-lg)",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 14,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="avatar-wrapper" style={{ width: 48, height: 48 }}>
                  <img
                    className="avatar-img"
                    src={user.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.identifier}`}
                    alt={user.display_name}
                  />
                  {user.is_online && <div className="online-indicator" />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user.display_name}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{user.identifier}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{presenceLabel(user)}</div>
                  {user.status_message && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{user.status_message}</div>}
                </div>
              </div>

              {/* Encryption Safety Badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--input-bg)",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.75rem",
                  color: "var(--signal-green)",
                  cursor: "pointer",
                }}
                onClick={() => onOpenSafetyNumber(user)}
                title="Click to view 60-digit Signal Safety Number"
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ShieldCheck size={14} /> End-to-End Encrypted
                </span>
                <span style={{ color: "var(--signal-blue)", textDecoration: "underline" }}>Verify</span>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn-primary"
                  style={{ flex: 1, height: 36, fontSize: "0.85rem" }}
                  onClick={() => onStartChat(user.id)}
                >
                  <MessageSquare size={16} /> Send Message
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
