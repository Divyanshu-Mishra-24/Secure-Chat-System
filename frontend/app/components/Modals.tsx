"use client";

import { useState, useEffect } from "react";
import {
  X, UserPlus, Users, ShieldCheck, QrCode, PhoneOff, Mic, MicOff,
  Video, VideoOff, LogOut, Moon, Sun, CheckCircle, Bell, Lock, User, Search, Trash2, Plus,
  MessageSquare, Info
} from "lucide-react";

function useModalEscape(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
}

// --- NEW CONTACT MODAL ---
export function NewContactModal({
  onClose,
  onAddContact,
}: {
  onClose: () => void;
  onAddContact: (identifier: string) => Promise<string | null>;
}) {
  useModalEscape(onClose);
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onAddContact(identifier.trim());
      if (result) setError(result);
      else onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add New Contact</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Enter the phone number or username of the user you wish to connect with on Signal.
            </p>
            <div className="form-group">
              <label>Phone Number or Username</label>
              <input
                className="input-field"
                type="text"
                placeholder="e.g. +15550101 or sarah"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Quick add:</span>
              {["+15550101", "+15550102", "+15550103", "+15550104"].map((num) => (
                <button
                  key={num}
                  type="button"
                  className="btn-secondary"
                  style={{ height: 28, padding: "0 8px", fontSize: "0.75rem" }}
                  onClick={() => setIdentifier(num)}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ width: "auto" }} disabled={busy}>
              {busy ? "Adding..." : "Add Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function NewMessageModal({
  onClose,
  onStartChat,
}: {
  onClose: () => void;
  onStartChat: (userId: number) => Promise<boolean>;
}) {
  useModalEscape(onClose);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalizedQuery = query.trim();
    setSelectedUserId(null);
    if (!normalizedQuery) {
      setUsers([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`http://localhost:8000/api/users/search?q=${encodeURIComponent(normalizedQuery)}`, { credentials: "include" })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (!cancelled) setUsers(Array.isArray(data?.users) ? data.users : []);
        })
        .catch(() => {
          if (!cancelled) setUsers([]);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function continueToChat() {
    if (selectedUserId == null || busy) return;
    setBusy(true);
    setError("");
    try {
      if (await onStartChat(selectedUserId)) onClose();
      else setError("Could not start this conversation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content new-message-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New Message</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body new-message-body">
          {error && <div className="error-banner">{error}</div>}
          <label className="new-message-search">
            <Search size={17} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" />
          </label>
          <div className="new-message-results">
            {!query.trim() ? (
              <div className="new-message-empty">Search for a name or username to start a conversation.</div>
            ) : users.length === 0 ? (
              <div className="new-message-empty">No people found.</div>
            ) : users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={`new-message-user ${selectedUserId === user.id ? "selected" : ""}`}
                onClick={() => setSelectedUserId(user.id)}
              >
                <span className="avatar-wrapper">
                  {user.avatar_url ? <img className="avatar-img" src={user.avatar_url} alt="" /> : <span className="avatar-fallback">{user.display_name?.charAt(0)}</span>}
                </span>
                <span className="new-message-user-copy"><strong>{user.display_name}</strong><small>{user.identifier}</small></span>
                <span className="new-message-select-indicator" />
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="text-button" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary modal-primary" disabled={selectedUserId == null || busy} onClick={continueToChat}>
            {busy ? "Opening..." : <><MessageSquare size={16} /> Continue</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- NEW GROUP MODAL ---
export function NewGroupModal({
  contacts,
  onClose,
  onCreateGroup,
}: {
  contacts: any[];
  onClose: () => void;
  onCreateGroup: (name: string, memberIds: number[]) => void;
}) {
  useModalEscape(onClose);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [availableUsers, setAvailableUsers] = useState<any[]>(contacts);

  // Fetch all registered users if contacts list is small or empty
  useEffect(() => {
    fetch(`http://localhost:8000/api/users/search?q=${encodeURIComponent(searchQuery)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.users) {
          // Combine contacts + search results without duplicates
          const combined = [...contacts];
          for (const u of data.users) {
            if (!combined.some((c) => c.id === u.id)) {
              combined.push(u);
            }
          }
          setAvailableUsers(combined);
        }
      })
      .catch(() => setAvailableUsers(contacts));
  }, [searchQuery, contacts]);

  function toggleSelect(id: number) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) {
      onCreateGroup(name.trim(), selectedIds);
      onClose();
    }
  }

  const filteredUsers = availableUsers.filter(
    (u) =>
      u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.identifier?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Create Group Chat</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Group Name</label>
              <input
                className="input-field"
                type="text"
                placeholder="e.g. Signal Core Devs"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Search & Select Members ({selectedIds.length} selected)</label>
              <div className="search-box" style={{ marginBottom: 8 }}>
                <Search size={16} />
                <input
                  className="search-input"
                  type="text"
                  placeholder="Search name or phone number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {filteredUsers.length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: 12, textAlign: "center" }}>
                    No matching users found.
                  </p>
                ) : (
                  filteredUsers.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        background: "var(--input-bg)",
                        borderRadius: "var(--radius-md)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggleSelect(c.id)}
                      />
                      <img className="avatar-img" src={c.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${c.identifier}`} alt={c.display_name} style={{ width: 28, height: 28 }} />
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 500 }}>{c.display_name}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.identifier}</span>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ width: "auto" }}>Create Group</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- SAFETY NUMBER MODAL ---
export function SafetyNumberModal({
  user,
  onClose,
}: {
  user: any;
  onClose: () => void;
}) {
  useModalEscape(onClose);
  const [verified, setVerified] = useState(true);

  const rawNum = user?.safety_number || "38192 48190 28190 48192 49102 94012 39102 49102 38192 10492 49201 39102";
  const blocks = rawNum.split(" ");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={20} style={{ color: "var(--signal-green)" }} /> Verify Safety Number
          </span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ textAlign: "center" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            To verify end-to-end encryption with <strong>{user?.display_name}</strong>, compare these 60 numbers with their device.
          </p>

          <div style={{ margin: "12px auto", width: 140, height: 140, background: "#fff", padding: 10, borderRadius: 12 }}>
            <QrCode size={120} style={{ color: "#000" }} />
          </div>

          <div className="safety-number-grid">
            {blocks.map((blk: string, idx: number) => (
              <div key={idx}>{blk}</div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 }}>
            <button
              className={`btn-secondary ${verified ? "active" : ""}`}
              onClick={() => setVerified(!verified)}
            >
              <CheckCircle size={16} style={{ color: verified ? "var(--signal-green)" : "inherit" }} />
              {verified ? "Marked as Verified" : "Mark as Verified"}
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-primary" style={{ width: "auto" }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// --- CALL PREVIEW MODAL ---
export function CallModal({
  user,
  callType,
  onClose,
}: {
  user: any;
  callType: "voice" | "video";
  onClose: () => void;
}) {
  useModalEscape(onClose);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="call-modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", color: "#fff", marginTop: 10 }}>
          <div style={{ fontSize: "0.8rem", color: "var(--signal-blue)", textTransform: "uppercase", fontWeight: 600 }}>
            Signal Encrypted {callType === "video" ? "Video" : "Voice"} Call
          </div>
          <h2 style={{ fontSize: "1.4rem", marginTop: 4 }}>{user?.display_name || "Contact"}</h2>
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>Connected • 00:42</span>
        </div>

        {callType === "video" && !videoOff ? (
          <div style={{ width: "100%", height: 220, background: "#19342A", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <img className="avatar-img" src={user?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"} alt="User" style={{ width: 100, height: 100 }} />
            <div style={{ position: "absolute", bottom: 12, right: 12, width: 90, height: 120, background: "#3A8F6D", borderRadius: 12, border: "2px solid #fff" }} />
          </div>
        ) : (
          <img className="call-user-avatar" src={user?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"} alt="User" />
        )}

        <div className="call-controls">
          <button className="call-btn" onClick={() => setMuted(!muted)}>
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          {callType === "video" && (
            <button className="call-btn" onClick={() => setVideoOff(!videoOff)}>
              {videoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
          )}
          <button className="call-btn end-call" onClick={onClose}>
            <PhoneOff size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- SETTINGS MODAL ---
export function SettingsModal({
  currentUser,
  themeMode,
  onSetTheme,
  onLogout,
  onSaveProfile,
  readReceipts,
  notifications,
  onReadReceiptsChange,
  onNotificationsChange,
  defaultDisappearingTimer,
  onDefaultDisappearingTimerChange,
  onClose,
}: {
  currentUser: any;
  themeMode: "dark" | "light" | "system";
  onSetTheme: (theme: "dark" | "light" | "system") => void;
  onLogout: () => void;
  onSaveProfile: (displayName: string) => Promise<boolean>;
  readReceipts: boolean;
  notifications: boolean;
  onReadReceiptsChange: (value: boolean) => void;
  onNotificationsChange: (value: boolean) => void;
  defaultDisappearingTimer: number;
  onDefaultDisappearingTimerChange: (value: number) => void;
  onClose: () => void;
}) {
  useModalEscape(onClose);
  const [section, setSection] = useState("Profile");
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser.display_name || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  async function saveProfile() {
    setSavingProfile(true);
    setProfileError("");
    try {
      if (await onSaveProfile(displayName.trim())) setEditingProfile(false);
      else setProfileError("Could not save your profile. Try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  const sections = [
    { name: "Profile", icon: User },
    { name: "Privacy", icon: Lock },
    { name: "Notifications", icon: Bell },
    { name: "Appearance", icon: Sun },
    { name: "Chats", icon: MessageSquare },
    { name: "About", icon: Info },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Signal Settings</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings categories">
            {sections.map(({ name, icon: Icon }) => (
              <button key={name} className={`settings-nav-item ${section === name ? "active" : ""}`} onClick={() => setSection(name)}>
                <Icon size={18} /> {name}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {section === "Profile" && (
              <div className="settings-profile">
                <div className="settings-profile-avatar">
                  {currentUser.avatar_url ? <img src={currentUser.avatar_url} alt={currentUser.display_name} /> : <span>{currentUser.display_name?.charAt(0)?.toUpperCase()}</span>}
                </div>
                {editingProfile ? (
                  <div className="settings-profile-edit">
                    <label htmlFor="settings-display-name">Display name</label>
                    <input id="settings-display-name" className="input-field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                    {profileError && <div className="error-banner">{profileError}</div>}
                    <div className="settings-profile-actions">
                      <button className="btn-secondary" onClick={() => { setEditingProfile(false); setDisplayName(currentUser.display_name || ""); }}>Cancel</button>
                      <button className="btn-primary modal-primary" disabled={!displayName.trim() || savingProfile} onClick={saveProfile}>{savingProfile ? "Saving..." : "Save"}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2>{currentUser.display_name}</h2>
                    <p>{currentUser.identifier}</p>
                    <button className="btn-secondary profile-edit-button" onClick={() => setEditingProfile(true)}>Edit Profile</button>
                  </>
                )}
              </div>
            )}
            {section === "Privacy" && (
              <div className="settings-section-content">
                <h2>Privacy</h2>
                <SettingToggle title="Read Receipts" description="Allow contacts to see when messages have been read." value={readReceipts} onChange={onReadReceiptsChange} />
                <div className="settings-preference-row"><div><strong>End-to-end encryption</strong><p>Your personal conversations are encrypted.</p></div><span className="settings-status">On</span></div>
              </div>
            )}
            {section === "Notifications" && (
              <div className="settings-section-content">
                <h2>Notifications</h2>
                <SettingToggle title="Message Notifications" description="Show notifications for new messages." value={notifications} onChange={onNotificationsChange} />
              </div>
            )}
            {section === "Appearance" && (
              <div className="settings-section-content">
                <h2>Appearance</h2>
                <div className="settings-preference-row"><div><strong>Theme</strong><p>Choose how Signal looks on this device.</p></div></div>
                <div className="theme-segmented-control">
                  {(["light", "dark", "system"] as const).map((mode) => (
                    <button key={mode} className={themeMode === mode ? "active" : ""} onClick={() => onSetTheme(mode)} aria-pressed={themeMode === mode}>
                      {mode === "light" ? <Sun size={16} /> : mode === "dark" ? <Moon size={16} /> : null}
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {section === "Chats" && (
              <div className="settings-section-content">
                <h2>Chats</h2>
                <div className="settings-preference-row">
                  <div><strong>Default disappearing messages</strong><p>Choose how long messages remain in conversations you create.</p></div>
                  <select className="input-field settings-duration-select" value={defaultDisappearingTimer} onChange={(event) => onDefaultDisappearingTimerChange(Number(event.target.value))} aria-label="Default disappearing message duration">
                    <option value={0}>Off</option><option value={5}>5 seconds</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={3600}>1 hour</option><option value={86400}>1 day</option>
                  </select>
                </div>
              </div>
            )}
            {section === "About" && (
              <div className="settings-section-content">
                <h2>About Signal</h2>
                <p className="settings-about-copy">Private messaging for everyday conversations.</p>
                <div className="settings-preference-row"><div><strong>Version</strong><p>Signal Messenger</p></div><span className="settings-status">1.0.0</span></div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer settings-footer">
          <button className="text-button destructive-button" onClick={onLogout}><LogOut size={16} /> Sign Out</button>
          <button className="btn-primary modal-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function SettingToggle({ title, description, value, onChange }: { title: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="settings-preference-row">
      <div><strong>{title}</strong><p>{description}</p></div>
      <button className={`settings-switch ${value ? "on" : ""}`} role="switch" aria-checked={value} aria-label={title} onClick={() => onChange(!value)}>
        <span />
      </button>
    </div>
  );
}

// --- GROUP INFO MODAL (WITH MEMBER ADDITION & REMOVAL) ---
export function GroupInfoModal({
  conversation,
  currentUser,
  onClose,
  onRefresh,
}: {
  conversation: any;
  currentUser: any;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  useModalEscape(onClose);
  const [searchMember, setSearchMember] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!searchMember.trim()) {
      setSearchResults([]);
      return;
    }
    fetch(`http://localhost:8000/api/users/search?q=${encodeURIComponent(searchMember.trim())}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.users) {
          // Filter out users already in the group
          const currentMemberIds = conversation.members?.map((m: any) => m.id) || [];
          setSearchResults(data.users.filter((u: any) => !currentMemberIds.includes(u.id)));
        }
      })
      .catch(() => undefined);
  }, [searchMember, conversation.members]);

  async function handleAddMember(userId: number) {
    setIsAdding(true);
    try {
      const res = await fetch(`http://localhost:8000/api/conversations/${conversation.id}/members`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        setSearchMember("");
        setSearchResults([]);
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error("Error adding member:", err);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemoveMember(userId: number) {
    try {
      const res = await fetch(`http://localhost:8000/api/conversations/${conversation.id}/members/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok && onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error("Error removing member:", err);
    }
  }

  const isAdmin = conversation.members?.some((m: any) => m.id === currentUser.id && m.role === "admin");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Group Details</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: "center", paddingBottom: 16, borderBottom: "1px solid var(--border-color)" }}>
            <img className="avatar-img" src={conversation.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${conversation.name}`} alt={conversation.name} style={{ width: 64, height: 64, margin: "0 auto 8px" }} />
            <h3 style={{ fontSize: "1.2rem" }}>{conversation.name}</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{conversation.members?.length || 0} members</span>
          </div>

          {/* Add New Member Section */}
          {isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 14, borderBottom: "1px solid var(--border-color)" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>ADD NEW MEMBER</span>
            <div className="search-box">
              <Search size={16} />
              <input
                className="search-input"
                type="text"
                placeholder="Search username or phone number..."
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
              />
            </div>

            {searchResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "var(--input-bg)", padding: 8, borderRadius: "var(--radius-md)" }}>
                {searchResults.map((u) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <img className="avatar-img" src={u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.identifier}`} alt={u.display_name} style={{ width: 24, height: 24 }} />
                      <span style={{ fontSize: "0.85rem" }}>{u.display_name} ({u.identifier})</span>
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ height: 28, width: "auto", padding: "0 10px", fontSize: "0.75rem" }}
                      disabled={isAdding}
                      onClick={() => handleAddMember(u.id)}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Existing Group Members List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>MEMBERS ({conversation.members?.length})</span>
            {conversation.members?.map((m: any) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img className="avatar-img" src={m.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${m.identifier}`} alt={m.display_name} style={{ width: 32, height: 32 }} />
                  <div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>{m.display_name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{m.identifier}</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {m.role === "admin" && (
                    <span style={{ fontSize: "0.7rem", background: "var(--signal-blue-alpha)", color: "var(--signal-blue)", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                      Admin
                    </span>
                  )}
                  {isAdmin && m.id !== currentUser.id && (
                    <button
                      className="icon-btn"
                      style={{ color: "var(--signal-red)" }}
                      title="Remove Member"
                      onClick={() => handleRemoveMember(m.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-primary" style={{ width: "auto" }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
