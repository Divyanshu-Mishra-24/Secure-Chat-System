"use client";

import { useEffect, useState, useRef } from "react";
import NavRail from "./components/NavRail";
import ConnectedUsersView from "./components/ConnectedUsersView";
import ComingSoonView from "./components/ComingSoonView";
import AuthModal from "./components/AuthModal";
import Sidebar, { Conversation } from "./components/Sidebar";
import ChatArea, { Message } from "./components/ChatArea";
import {
  NewContactModal, NewMessageModal, NewGroupModal, SafetyNumberModal,
  CallModal, SettingsModal, GroupInfoModal
} from "./components/Modals";
import { MessageSquare, UserPlus, Users, ShieldCheck } from "lucide-react";
import { parseProjectTimestamp } from "./utils/dateTime";
import { API_BASE, WS_BASE } from "./utils/api";

export default function Home() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<{ [convId: number]: boolean }>({});
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [themeMode, setThemeMode] = useState<"dark" | "light" | "system">("light");
  const [navRailTab, setNavRailTab] = useState<"chats" | "status" | "users" | "archive">("chats");
  const [showNewContact, setShowNewContact] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showSafetyNumber, setShowSafetyNumber] = useState(false);
  const [showCall, setShowCall] = useState<"voice" | "video" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [defaultDisappearingTimer, setDefaultDisappearingTimer] = useState(0);
  const [incomingToast, setIncomingToast] = useState<{ conversationId: number; name: string; content: string } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const typingTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const typingStateRef = useRef<Record<number, boolean>>({});
  const activeConvIdRef = useRef<number | null>(activeConvId);
  activeConvIdRef.current = activeConvId;

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const activeConv = conversations.find((conv) => conv.id === activeConvId) ?? null;

  useEffect(() => {
    if (!currentUser) return;
    fetch(`${API_BASE}/users/preferences`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data?.preferences) return;
        setReadReceiptsEnabled(Boolean(data.preferences.read_receipts_enabled));
        setNotificationsEnabled(Boolean(data.preferences.notifications_enabled));
        setDefaultDisappearingTimer(Number(data.preferences.default_disappearing_timer) || 0);
      }).catch(() => {});
  }, [currentUser?.id]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("signal-theme-mode");
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
      setThemeMode(savedTheme);
      setTheme(savedTheme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : savedTheme);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(`${WS_BASE}/${currentUser.id}`);
      socketRef.current = socket;

      socket.onopen = () => {
        const activeConversationId = activeConvIdRef.current;
        if (activeConversationId && typingStateRef.current[activeConversationId]) {
          socket?.send(JSON.stringify({
            type: "typing",
            conversation_id: activeConversationId,
            is_typing: true,
          }));
        }
        void fetchConversations();
        fetch(`${API_BASE}/users/connected`, { credentials: "include" })
          .then((response) => response.ok ? response.json() : null)
          .then((data) => {
            const connected = Array.isArray(data?.users) ? data.users : [];
            setContacts(connected);
          })
          .catch(() => {});
        if (activeConversationId) {
          fetch(`${API_BASE}/conversations/${activeConversationId}/read`, {
            method: "POST",
            credentials: "include",
          }).then((response) => {
            if (response.ok) {
              setConversations((previous) => previous.map((conversation) =>
                conversation.id === activeConversationId ? { ...conversation, unread_count: 0 } : conversation));
            }
          }).catch(() => {});
          fetch(`${API_BASE}/conversations/${activeConversationId}/messages`, { credentials: "include" })
            .then((response) => response.ok ? response.json() : null)
            .then((data) => {
              if (!data || activeConvIdRef.current !== activeConversationId) return;
              setMessages((previous) => {
                const merged = new Map<number, Message>();
                for (const message of data.messages ?? []) merged.set(message.id, message as Message);
                for (const message of previous) {
                  if (message.conversation_id === activeConversationId) merged.set(message.id, message);
                }
                return Array.from(merged.values()).sort((left, right) => left.id - right.id);
              });
            })
            .catch(() => {});
        }
      };

      socket.onmessage = (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.type === "new_message" && data.message) {
          const message = data.message as Message;
          const conversationId = Number(data.conversation_id);
          const isOpen = activeConvIdRef.current === conversationId;

          if (isOpen) {
            setMessages((previous) => {
              const existingIndex = previous.findIndex((item) => item.id === message.id);
              if (existingIndex < 0) return [...previous, message].sort((a, b) => a.id - b.id);
              return previous.map((item) => item.id === message.id ? { ...item, ...message } : item);
            });
            fetch(`${API_BASE}/conversations/${conversationId}/read`, {
              method: "POST",
              credentials: "include",
            }).catch(() => {});
          }

          if (message.sender_id !== currentUser.id && !isOpen && notificationsEnabled) {
            const conversation = conversations.find((item) => item.id === conversationId);
            setIncomingToast({ conversationId, name: conversation?.name ?? message.sender_name, content: message.content || "Sent an attachment" });
            window.setTimeout(() => setIncomingToast(null), 4500);
          }

          setConversations((previous) => previous
            .map((conversation) => conversation.id === conversationId
              ? {
                  ...conversation,
                  last_message: message,
                  updated_at: message.created_at,
                  unread_count: isOpen || message.sender_id === currentUser.id
                    ? 0
                    : (conversation.unread_count || 0) + 1,
                }
              : conversation)
            .sort((a, b) => (parseProjectTimestamp(b.updated_at)?.getTime() ?? 0) - (parseProjectTimestamp(a.updated_at)?.getTime() ?? 0)));
        } else if (data.type === "typing_status") {
          const conversationId = Number(data.conversation_id);
          if (typingTimersRef.current[conversationId]) clearTimeout(typingTimersRef.current[conversationId]);
          if (data.is_typing) {
            typingTimersRef.current[conversationId] = setTimeout(() => {
              setTypingUsers((previous) => ({ ...previous, [conversationId]: false }));
              delete typingTimersRef.current[conversationId];
            }, 5000);
          } else {
            delete typingTimersRef.current[conversationId];
          }
          setTypingUsers((previous) => ({
            ...previous,
            [conversationId]: Boolean(data.is_typing),
          }));
        } else if (data.type === "reaction_update") {
          const conversationId = Number(data.conversation_id);
          const messageId = Number(data.message_id);
          setMessages((previous) => previous.map((message) =>
            message.conversation_id === conversationId && message.id === messageId
              ? { ...message, reactions: Array.isArray(data.reactions) ? data.reactions : [] }
              : message));
        } else if (data.type === "messages_read" || data.type === "message_status") {
          const conversationId = Number(data.conversation_id);
          const statuses = data.statuses ?? {};
          setMessages((previous) => previous.map((message) => {
            const status = statuses[String(message.id)];
            return message.conversation_id === conversationId && message.sender_id === currentUser.id && status
              ? { ...message, status }
              : message;
          }));
          setConversations((previous) => previous.map((conversation) => {
            if (conversation.id !== conversationId) return conversation;
            const markedByCurrentUser = data.type === "messages_read" && data.read_by_user_id === currentUser.id;
            if (markedByCurrentUser && conversationId === activeConvIdRef.current) {
              return { ...conversation, unread_count: 0 };
            }
            if (!conversation.last_message) return conversation;
            const status = statuses[String(conversation.last_message.id)];
            return status ? { ...conversation, last_message: { ...conversation.last_message, status } } : conversation;
          }));
        } else if (data.type === "user_presence") {
          const updateUser = (user: any) => user.id === Number(data.user_id)
            ? { ...user, is_online: Boolean(data.is_online), last_seen: data.last_seen ?? user.last_seen }
            : user;
          setContacts((previous) => previous.map(updateUser));
          setConversations((previous) => previous.map((conversation) => ({
            ...conversation,
            members: conversation.members?.map(updateUser),
            other_user: conversation.other_user ? updateUser(conversation.other_user) : conversation.other_user,
          })));
        }
      };

      socket.onclose = () => {
        if (!disposed) reconnectTimer = setTimeout(connect, 1500);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      Object.values(typingTimersRef.current).forEach(clearTimeout);
      typingTimersRef.current = {};
      typingStateRef.current = {};
      setTypingUsers({});
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [currentUser, notificationsEnabled]);

  useEffect(() => {
    if (themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setTheme(media.matches ? "dark" : "light");
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, [themeMode]);

  useEffect(() => {
    const savedActiveConvId = Number(localStorage.getItem("signal-active-conversation"));
    if (Number.isFinite(savedActiveConvId) && savedActiveConvId > 0) {
      setActiveConvId(savedActiveConvId);
    }
  }, []);

  useEffect(() => {
    if (activeConvId != null) {
      localStorage.setItem("signal-active-conversation", String(activeConvId));
    } else {
      localStorage.removeItem("signal-active-conversation");
    }
  }, [activeConvId]);

  useEffect(() => {
    async function loadSession() {
      try {
        const meRes = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (!meRes.ok) {
          setCurrentUser(null);
          return;
        }

        const meData = await meRes.json();
        setCurrentUser(meData.user ?? meData ?? null);
      } catch {
        setCurrentUser(null);
      }
    }

    loadSession();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setContacts([]);
      setConversations([]);
      setMessages([]);
      setTypingUsers({});
      setActiveConvId(null);
      return;
    }

    async function loadUserData() {
      try {
        const contactsRes = await fetch(`${API_BASE}/users/connected`, { credentials: "include" });
        if (contactsRes.ok) {
          const contactsData = await contactsRes.json();
          const nextContacts = Array.isArray(contactsData)
            ? contactsData
            : Array.isArray(contactsData.users)
              ? contactsData.users
              : Array.isArray(contactsData.contacts)
                ? contactsData.contacts
                : [];
          setContacts(nextContacts);
        }
      } catch {
        setContacts([]);
      }

      try {
        const conversationsRes = await fetch(`${API_BASE}/conversations`, { credentials: "include" });
        if (conversationsRes.ok) {
          const data = await conversationsRes.json();
          const nextConversations = Array.isArray(data.conversations) ? data.conversations : Array.isArray(data) ? data : [];
          setConversations(nextConversations);

          if (nextConversations.length > 0) {
            const savedActiveConvId = Number(localStorage.getItem("signal-active-conversation"));
            const hasSavedActive = Number.isFinite(savedActiveConvId) && nextConversations.some((conv: Conversation) => conv.id === savedActiveConvId);
            const nextActiveId = hasSavedActive
              ? savedActiveConvId
              : (activeConvId && nextConversations.some((conv: Conversation) => conv.id === activeConvId) ? activeConvId : nextConversations[0].id);
            setActiveConvId(nextActiveId);
          } else {
            setActiveConvId(null);
          }
        }
      } catch {
        setConversations([]);
      }
    }

    loadUserData();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !activeConvId) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      try {
        const res = await fetch(`${API_BASE}/conversations/${activeConvId}/messages`, {
          credentials: "include",
        });
        if (!res.ok) {
          setMessages([]);
          return;
        }

        const data = await res.json();
        if (activeConvIdRef.current !== activeConvId) return;
        setMessages((previous) => {
          const loaded = Array.isArray(data.messages) ? data.messages as Message[] : [];
          const byId = new Map(loaded.map((message) => [message.id, message]));
          previous.filter((message) => message.conversation_id === activeConvId)
            .forEach((message) => byId.set(message.id, message));
          return Array.from(byId.values()).sort((a, b) => a.id - b.id);
        });
      } catch {
        setMessages([]);
      }
    }

    loadMessages();
    fetch(`${API_BASE}/conversations/${activeConvId}/read`, {
      method: "POST",
      credentials: "include",
    }).then(() => {
      setConversations((previous) => previous.map((conversation) =>
        conversation.id === activeConvId ? { ...conversation, unread_count: 0 } : conversation));
    }).catch(() => {});
  }, [currentUser, activeConvId]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    setThemeMode(nextTheme);
    localStorage.setItem("signal-theme-mode", nextTheme);
  }

  function setThemePreference(mode: "dark" | "light" | "system") {
    setThemeMode(mode);
    localStorage.setItem("signal-theme-mode", mode);
    if (mode !== "system") setTheme(mode);
    else setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  async function fetchConversations(_refresh = false) {
    try {
      const res = await fetch(`${API_BASE}/conversations`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const nextConversations = Array.isArray(data.conversations) ? data.conversations : Array.isArray(data) ? data : [];
      setConversations(nextConversations);

      if (nextConversations.length > 0) {
        const savedActiveConvId = Number(localStorage.getItem("signal-active-conversation"));
        const currentActiveId = activeConvIdRef.current;
        const hasSavedActive = Number.isFinite(savedActiveConvId) && nextConversations.some((conv: Conversation) => conv.id === savedActiveConvId);
        const nextActiveId = hasSavedActive
          ? savedActiveConvId
          : (currentActiveId && nextConversations.some((conv: Conversation) => conv.id === currentActiveId) ? currentActiveId : nextConversations[0].id);
        setActiveConvId(nextActiveId);
      } else {
        setActiveConvId(null);
      }
    } catch {
      setConversations([]);
    }
  }

  async function handleAddContact(identifier: string): Promise<string | null> {
    try {
      const addRes = await fetch(`${API_BASE}/contacts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const addData = await addRes.json();
      if (!addRes.ok) return addData.detail || "Could not add this user.";

      const res = await fetch(`${API_BASE}/users/connected`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setContacts(Array.isArray(data.users) ? data.users : Array.isArray(data.contacts) ? data.contacts : []);
      }
      await fetchConversations();
      return null;
    } catch {
      return "Could not connect to the server. Please try again.";
    }
  }

  async function handleCreateGroup(_groupData: any) {
    setShowNewGroup(false);
    await fetchConversations();
  }

  async function handleStartChat(userId: number): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/conversations/direct`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_user_id: userId }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.conversation_id) return false;
      setNavRailTab("chats");
      await fetchConversations();
      setActiveConvId(data.conversation_id);
      return true;
    } catch {
      return false;
    }
  }

  async function handleSaveProfile(displayName: string): Promise<boolean> {
    if (!displayName.trim()) return false;
    try {
      const res = await fetch(`${API_BASE}/users/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.user) setCurrentUser(data.user);
      return true;
    } catch {
      return false;
    }
  }

  async function updateUserPreference(key: "read_receipts_enabled" | "notifications_enabled", value: boolean) {
    const setter = key === "read_receipts_enabled" ? setReadReceiptsEnabled : setNotificationsEnabled;
    const previous = key === "read_receipts_enabled" ? readReceiptsEnabled : notificationsEnabled;
    setter(value);
    try {
      const response = await fetch(`${API_BASE}/users/preferences`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) throw new Error("Preference update failed");
    } catch {
      setter(previous);
    }
  }

  async function updateDefaultTimer(value: number) {
    const previous = defaultDisappearingTimer;
    setDefaultDisappearingTimer(value);
    try {
      const response = await fetch(`${API_BASE}/users/preferences`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_disappearing_timer: value }),
      });
      if (!response.ok) throw new Error("Preference update failed");
    } catch { setDefaultDisappearingTimer(previous); }
  }

  async function toggleConversationPreference(id: number, key: "is_favorite" | "is_archived", value: boolean) {
    const previous = conversations;
    setConversations((items) => items.map((conversation) => conversation.id === id ? { ...conversation, [key]: value } : conversation));
    try {
      const response = await fetch(`${API_BASE}/conversations/${id}/preferences`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) throw new Error("Conversation preference update failed");
      if (key === "is_archived" && value && activeConvId === id) setActiveConvId(null);
    } catch {
      setConversations(previous);
    }
  }

  function selectNavTab(tab: "chats" | "status" | "users" | "archive") {
    setNavRailTab(tab);
    setMobileChatOpen(false);
    if (tab === "chats" || tab === "archive") {
      const archived = tab === "archive";
      const matching = conversations.filter((conversation) => Boolean(conversation.is_archived) === archived);
      if (!matching.some((conversation) => conversation.id === activeConvId)) {
        setActiveConvId(matching[0]?.id ?? null);
      }
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore logout failures in local UI mode
    }
    localStorage.removeItem("signal-active-conversation");
    setCurrentUser(null);
    setContacts([]);
    setConversations([]);
    setMessages([]);
    setTypingUsers({});
    setActiveConvId(null);
    setShowSettings(false);
    setNavRailTab("chats");
  }

  async function handleSendMessage(content: string, attachment?: any, replyToId?: number) {
    if (!activeConv || !safeCurrentUser || (!content.trim() && !attachment)) return false;

    const trimmedContent = content.trim();
    const payload = {
      conversation_id: activeConv.id,
      content: trimmedContent,
      reply_to_id: replyToId ?? null,
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.filename ?? null,
      attachment_type: attachment?.type ?? null,
    };

    try {
      const res = await fetch(`${API_BASE}/conversations/${activeConv.id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Send failed");
      }

      const payloadJson = await res.json();
      const nextMessage = payloadJson.message;
      if (nextMessage) {
        setMessages((prev) => {
          const exists = prev.some((msg) => msg.id === nextMessage.id);
          return exists ? prev : [...prev, nextMessage];
        });
      }

      await fetchConversations();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSendReaction(messageId: number, emoji: string) {
    try {
      const response = await fetch(`${API_BASE}/messages/${messageId}/reactions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!response.ok) throw new Error("Reaction could not be saved");
      const data = await response.json();
      setMessages((previous) => previous.map((message) =>
        message.id === messageId ? { ...message, reactions: data.reactions ?? [] } : message));
    } catch (error) {
      console.error("Could not update message reaction:", error);
    }
  }

  function handleSendTyping(isTyping: boolean) {
    if (!activeConv) return;
    typingStateRef.current[activeConv.id] = isTyping;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "typing",
        conversation_id: activeConv.id,
        is_typing: isTyping,
      }));
    }
  }

  async function handleChangeDisappearingTimer(seconds: number) {
    if (!activeConv) return;
    setConversations((prev) =>
      prev.map((conv) => (conv.id === activeConv.id ? { ...conv, disappearing_timer: seconds } : conv))
    );
  }

  if (!currentUser) {
    return <AuthModal onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  const safeCurrentUser = currentUser;

  return (
    <div className="app-container" data-theme={theme}>
      <NavRail
        currentUser={safeCurrentUser}
        activeTab={navRailTab}
        onSelectTab={selectNavTab}
        unreadTotal={unreadTotal}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
      />

      {navRailTab === "status" ? (
        <ComingSoonView />
      ) : navRailTab === "users" ? (
        <ConnectedUsersView
          contacts={contacts}
          onStartChat={handleStartChat}
          onOpenSafetyNumber={() => setShowSafetyNumber(true)}
          onOpenAddContact={() => setShowNewContact(true)}
        />
      ) : (
        <>
          <Sidebar
            currentUser={safeCurrentUser}
            conversations={conversations}
            activeConvId={activeConvId}
            archiveMode={navRailTab === "archive"}
            className={mobileChatOpen ? "mobile-hidden" : ""}
            onToggleFavorite={(id, value) => void toggleConversationPreference(id, "is_favorite", value)}
            onToggleArchive={(id, value) => void toggleConversationPreference(id, "is_archived", value)}
            onSelectConv={(conv) => { setActiveConvId(conv.id); setMobileChatOpen(true); }}
            onOpenNewMessage={() => setShowNewMessage(true)}
            onOpenNewContact={() => setShowNewContact(true)}
            onOpenNewGroup={() => setShowNewGroup(true)}
            onOpenSettings={() => setShowSettings(true)}
          />

          {activeConv ? (
            <ChatArea
              currentUser={safeCurrentUser}
              conversation={activeConv}
              className={mobileChatOpen ? "" : "mobile-hidden"}
              onBack={() => setMobileChatOpen(false)}
              messages={messages}
              isTyping={!!typingUsers[activeConv.id]}
              onSendMessage={handleSendMessage}
              onSendReaction={handleSendReaction}
              onSendTyping={handleSendTyping}
              onOpenSafetyNumber={() => setShowSafetyNumber(true)}
              onOpenCall={(type) => setShowCall(type)}
              onChangeDisappearingTimer={handleChangeDisappearingTimer}
              onOpenGroupInfo={() => setShowGroupInfo(true)}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", background: "var(--bg-dark)" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--signal-blue-alpha)", color: "var(--signal-blue)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <MessageSquare size={32} />
              </div>
              <h2 style={{ fontSize: "1.4rem", marginBottom: 8, color: "var(--text-primary)" }}>
                Welcome to Signal, {safeCurrentUser.display_name}!
              </h2>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: 380, marginBottom: 24 }}>
                End-to-end encrypted messaging. Pick a conversation from the sidebar or add a contact to start chatting.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn-primary" style={{ width: "auto" }} onClick={() => setShowNewContact(true)}>
                  <UserPlus size={18} /> Add Contact
                </button>
                <button className="btn-secondary" style={{ width: "auto" }} onClick={() => setShowNewGroup(true)}>
                  <Users size={18} /> Create Group
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showNewContact && (
        <NewContactModal
          onClose={() => setShowNewContact(false)}
          onAddContact={handleAddContact}
        />
      )}

      {showNewMessage && (
        <NewMessageModal
          onClose={() => setShowNewMessage(false)}
          onStartChat={handleStartChat}
        />
      )}

      {showNewGroup && (
        <NewGroupModal
          contacts={contacts}
          onClose={() => setShowNewGroup(false)}
          onCreateGroup={handleCreateGroup}
        />
      )}

      {showSafetyNumber && activeConv && (
        <SafetyNumberModal
          user={activeConv.other_user || safeCurrentUser}
          onClose={() => setShowSafetyNumber(false)}
        />
      )}

      {showCall && activeConv && (
        <CallModal
          user={activeConv.other_user || safeCurrentUser}
          callType={showCall}
          onClose={() => setShowCall(null)}
        />
      )}

      {showSettings && (
        <SettingsModal
          currentUser={safeCurrentUser}
          themeMode={themeMode}
          onSetTheme={setThemePreference}
          onLogout={handleLogout}
          onSaveProfile={handleSaveProfile}
          readReceipts={readReceiptsEnabled}
          notifications={notificationsEnabled}
          onReadReceiptsChange={(value) => void updateUserPreference("read_receipts_enabled", value)}
          onNotificationsChange={(value) => void updateUserPreference("notifications_enabled", value)}
          defaultDisappearingTimer={defaultDisappearingTimer}
          onDefaultDisappearingTimerChange={(value) => void updateDefaultTimer(value)}
          onClose={() => setShowSettings(false)}
        />
      )}

      {incomingToast && <button type="button" className="incoming-message-toast" onClick={() => {
        const target = conversations.find((conversation) => conversation.id === incomingToast.conversationId);
        if (target) { setNavRailTab("chats"); setActiveConvId(target.id); setMobileChatOpen(true); }
        setIncomingToast(null);
      }}><MessageSquare size={17} /><span><strong>{incomingToast.name}</strong><small>{incomingToast.content}</small></span></button>}

      {showGroupInfo && activeConv && activeConv.type === "group" && (
        <GroupInfoModal
          conversation={activeConv}
          currentUser={safeCurrentUser}
          onClose={() => setShowGroupInfo(false)}
          onRefresh={() => fetchConversations()}
        />
      )}
    </div>
  );
}
