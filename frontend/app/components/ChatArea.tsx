"use client";

import { Fragment, useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import {
  Video, ShieldCheck, Clock, Paperclip, Send, Smile, X,
  Check, CheckCheck, FileText, Image as ImageIcon, CornerUpLeft, ArrowLeft, Flame, Search, MoreVertical, CheckCircle
} from "lucide-react";
import { Conversation } from "./Sidebar";
import { formatKolkataShortDate, formatKolkataTime, isSameKolkataDay, kolkataDateKey, parseProjectTimestamp, PROJECT_TIME_ZONE } from "../utils/dateTime";

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar?: string;
  content: string;
  reply_to_id?: number;
  reply_to?: {
    id: number;
    content: string;
    sender_name: string;
  };
  status: "sending" | "sent" | "delivered" | "read";
  is_system: boolean;
  expires_at?: string;
  created_at: string;
  attachments?: any[];
  reactions?: { id: number; emoji: string; user_id: number; display_name: string }[];
}

interface ChatAreaProps {
  currentUser: any;
  conversation: Conversation;
  messages: Message[];
  isTyping: boolean;
  onSendMessage: (content: string, attachment?: any, replyToId?: number) => Promise<boolean>;
  onSendReaction: (messageId: number, emoji: string) => void;
  onSendTyping: (isTyping: boolean) => void;
  onOpenSafetyNumber: () => void;
  onOpenCall: (type: "voice" | "video") => void;
  onChangeDisappearingTimer: (seconds: number) => void;
  onOpenGroupInfo: () => void;
  className?: string;
  onBack?: () => void;
}

export default function ChatArea({
  currentUser,
  conversation,
  messages,
  isTyping,
  onSendMessage,
  onSendReaction,
  onSendTyping,
  onOpenSafetyNumber,
  onOpenCall,
  onChangeDisappearingTimer,
  onOpenGroupInfo,
  className = "",
  onBack,
}: ChatAreaProps) {
  const [inputText, setInputText] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [attachment, setAttachment] = useState<any | null>(null);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [fileAccept, setFileAccept] = useState("*/*");
  const [isUploading, setIsUploading] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [showSentToast, setShowSentToast] = useState(false);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const toastTimeoutRef = useRef<any>(null);

  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value);
    setSendFailed(false);
    const isTyping = e.target.value.trim().length > 0;
    onSendTyping(isTyping);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (!isTyping) return;
    typingTimeoutRef.current = setTimeout(() => {
      onSendTyping(false);
    }, 2000);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleSend() {
    if (!inputText.trim() && !attachment) return;
    const sent = await onSendMessage(inputText.trim(), attachment, replyTarget?.id);
    if (!sent) {
      setSendFailed(true);
      return;
    }
    setSendFailed(false);
    setInputText("");
    setAttachment(null);
    setReplyTarget(null);
    onSendTyping(false);
    setShowSentToast(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setShowSentToast(false), 2400);
  }

  function chooseAttachment(accept: string) {
    setFileAccept(accept);
    setShowAttachmentMenu(false);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://localhost:8000/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setAttachment({
          url: data.url,
          filename: data.filename,
          type: data.type,
        });
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  }

  function formatTime(isoStr: string) {
    return formatKolkataTime(isoStr);
  }

  function formatLastSeen(isoStr?: string | null) {
    if (!isoStr) return "Offline";
    const date = parseProjectTimestamp(isoStr);
    if (!date) return "Offline";
    const now = new Date();
    const dateLabel = isSameKolkataDay(date, now)
      ? "today"
      : formatKolkataShortDate(isoStr);
    return `Last seen ${dateLabel} at ${formatTime(isoStr)}`;
  }

  function formatMessageDate(isoStr: string) {
    const date = parseProjectTimestamp(isoStr);
    if (!date) return "";
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const dateKey = kolkataDateKey(date);
    if (dateKey === kolkataDateKey(today)) return "TODAY";
    if (dateKey === kolkataDateKey(yesterday)) return "YESTERDAY";
    const sameYear = dateKey.slice(0, 4) === kolkataDateKey(today).slice(0, 4);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: PROJECT_TIME_ZONE,
      month: "long",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    }).format(date).toUpperCase();
  }

  const isGroup = conversation.type === "group";
  const otherUser = conversation.other_user;
  const visibleMessages = messages.filter((message) => {
    const query = messageSearch.trim().toLowerCase();
    return !query || `${message.content} ${message.sender_name} ${message.reply_to?.content ?? ""}`.toLowerCase().includes(query);
  });

  return (
    <div className={`chat-pane ${className}`}>
      {/* Chat Header matching screenshot */}
      <div className="chat-header">
        {onBack && <button type="button" className="icon-btn mobile-chat-back" onClick={onBack} aria-label="Back to chats"><ArrowLeft size={18} /></button>}
        <div className="chat-header-info" onClick={isGroup ? onOpenGroupInfo : onOpenSafetyNumber}>
          <div className="avatar-wrapper">
            {conversation.avatar_url ? (
              <img className="avatar-img" src={conversation.avatar_url} alt={conversation.name} />
            ) : (
              <div className="avatar-fallback">{conversation.name.charAt(0).toUpperCase()}</div>
            )}
            {!isGroup && otherUser?.is_online && <div className="online-indicator" />}
          </div>

          <div>
            <div className="chat-header-title">
              {conversation.name}
              {!isGroup && <span className="encryption-tag"><ShieldCheck size={12} /> Encrypted</span>}
            </div>
            <div className="chat-header-subtitle">
              {isGroup ? (
                `${conversation.members.length} members`
              ) : otherUser?.is_online ? (
                "Online"
              ) : (
                formatLastSeen(otherUser?.last_seen)
              )}
            </div>
          </div>
        </div>

        <div className="chat-header-actions">
          {/* Disappearing timer badge */}
          <div className="disappearing-badge" onClick={() => setShowTimerMenu(!showTimerMenu)}>
            <Clock size={14} />
            <span>
              {conversation.disappearing_timer === 0
                ? "Disappearing: Off"
                : `${conversation.disappearing_timer}s`}
            </span>
          </div>

          {showTimerMenu && (
            <div
              style={{
                position: "absolute",
                top: 54,
                right: 140,
                background: "var(--panel-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                padding: 8,
                zIndex: 20,
                boxShadow: "var(--shadow-lg)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", padding: "4px 8px" }}>
                Set Disappearing Timer
              </div>
              {[0, 5, 30, 60, 3600, 86400].map((sec) => (
                <button
                  key={sec}
                  className="btn-secondary"
                  style={{ justifyContent: "flex-start", padding: "6px 12px" }}
                  onClick={() => {
                    onChangeDisappearingTimer(sec);
                    setShowTimerMenu(false);
                  }}
                >
                  {sec === 0 ? "Off" : sec < 60 ? `${sec} seconds` : sec === 60 ? "1 minute" : sec === 3600 ? "1 hour" : "1 day"}
                </button>
              ))}
            </div>
          )}

          <button className="icon-btn" onClick={() => onOpenCall("video")} title="Video Call">
            <Video size={18} />
          </button>
          <button className={`icon-btn ${messageSearchOpen ? "active" : ""}`} title="Search Messages" aria-label="Search messages" onClick={() => { setMessageSearchOpen((open) => !open); setMessageSearch(""); }}>
            <Search size={18} />
          </button>
          <button className="icon-btn" onClick={isGroup ? onOpenGroupInfo : onOpenSafetyNumber} title="Menu">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {messageSearchOpen && <div className="message-search-bar"><Search size={16} /><input autoFocus value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Search in conversation" /><button className="icon-btn" onClick={() => { setMessageSearch(""); setMessageSearchOpen(false); }} aria-label="Close message search"><X size={16} /></button></div>}

      {/* Messages Feed with Doodle Pattern Wallpaper Background */}
      <div className="messages-feed chat-wallpaper">
        {visibleMessages.length === 0 && messageSearch.trim() ? <div className="message-search-empty">No matching messages.</div> : visibleMessages.map((msg, index) => {
          const parsedDate = parseProjectTimestamp(msg.created_at);
          const date = parsedDate ? kolkataDateKey(parsedDate) : msg.created_at;
          const previousTimestamp = index > 0 ? parseProjectTimestamp(visibleMessages[index - 1].created_at) : null;
          const previousDate = previousTimestamp ? kolkataDateKey(previousTimestamp) : null;
          const dateDivider = date !== previousDate ? <div className="date-divider"><span>{formatMessageDate(msg.created_at)}</span></div> : null;
          if (msg.is_system) {
            return (
              <Fragment key={msg.id}>{dateDivider}<div className="system-msg">{msg.content}</div></Fragment>
            );
          }

          const isOutgoing = msg.sender_id === currentUser.id;
          const previousMessage = index > 0 ? visibleMessages[index - 1] : null;
          const isGrouped = !!previousMessage && !previousMessage.is_system && previousMessage.sender_id === msg.sender_id && previousDate === date;
          const isNewSender = !!previousMessage && !previousMessage.is_system && previousMessage.sender_id !== msg.sender_id && previousDate === date;

          return (
            <Fragment key={msg.id}>
            {dateDivider}
            <div className={`msg-row ${isOutgoing ? "outgoing" : "incoming"} ${isGrouped ? "grouped" : ""} ${isNewSender ? "new-sender" : ""}`}>
              {!isOutgoing && (
                <img
                  className="msg-avatar"
                  src={msg.sender_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.sender_id}`}
                  alt={msg.sender_name}
                />
              )}

              <div className="msg-bubble">
                {/* Quick Emoji Hover Menu */}
                <div className="msg-actions-overlay">
                  {["\u2764\uFE0F", "\u{1F44D}", "\u{1F602}", "\u{1F62E}", "\u{1F525}"].map((emoji) => (
                    <button
                      key={emoji}
                      className="emoji-btn"
                      type="button"
                      title={`React with ${emoji}`}
                      onClick={() => onSendReaction(msg.id, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {isGroup && !isOutgoing && (
                  <div className="msg-sender-name">{msg.sender_name}</div>
                )}

                {msg.reply_to && (
                  <div className="quoted-msg-box">
                    <div className="quoted-msg-author">{msg.reply_to.sender_name}</div>
                    <div className="quoted-msg-text">{msg.reply_to.content}</div>
                  </div>
                )}

                {msg.content}

                {msg.attachments?.map((att: any, idx: number) => (
                  <div key={idx} style={{ marginTop: 6 }}>
                    {att.file_type === "image" ? (
                      <img className="msg-attachment-img" src={att.file_path} alt={att.file_name} />
                    ) : (
                      <a
                        href={att.file_path}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 6, color: "inherit", textDecoration: "underline" }}
                      >
                        <FileText size={16} /> {att.file_name}
                      </a>
                    )}
                  </div>
                ))}

                <div className="msg-footer">
                  {msg.expires_at && <Flame size={12} style={{ color: "#FF9500" }} />}
                  <span>{formatTime(msg.created_at)}</span>
                  {isOutgoing && (
                    <span style={{ display: "inline-flex", marginLeft: 2 }}>
                      {msg.status === "read" ? (
                        <CheckCheck size={14} style={{ color: "#3A8F6D" }} />
                      ) : msg.status === "delivered" ? (
                        <CheckCheck size={14} />
                      ) : (
                        <Check size={14} />
                      )}
                    </span>
                  )}
                </div>

                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="reactions-row">
                    {msg.reactions.map((r) => (
                      <button key={r.id} type="button" className={`reaction-pill ${r.user_id === currentUser.id ? "mine" : ""}`} title={`${r.display_name} reacted ${r.emoji}. Click to toggle.`} onClick={() => onSendReaction(msg.id, r.emoji)}>
                        {r.emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="msg-reply-action"
                onClick={() => setReplyTarget(msg)}
                title="Reply to message"
                aria-label={`Reply to ${msg.sender_name}'s message`}
              >
                <CornerUpLeft size={16} />
              </button>
            </div>
            </Fragment>
          );
        })}

        {isTyping && (
          <div className="typing-bar">
            <span>Someone is typing</span>
            <div className="typing-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Composer matching screenshot layout */}
      <div className="chat-input-area">
        {replyTarget && (
          <div className="reply-preview-bar">
            <div>
              <strong style={{ fontSize: "0.75rem", color: "var(--signal-blue)" }}>
                Replying to {replyTarget.sender_name}
              </strong>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                {replyTarget.content}
              </div>
            </div>
            <button className="icon-btn" onClick={() => setReplyTarget(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        {attachment && (
          <div className="attachment-preview">
            <ImageIcon size={16} />
            <span>{attachment.filename}</span>
            <button className="icon-btn" onClick={() => setAttachment(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="input-row">
          <input
            type="file"
            ref={fileInputRef}
            accept={fileAccept}
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />

          <div className="composer-menu-anchor">
            <button className="icon-btn composer-tool-btn" onClick={() => setShowAttachmentMenu((open) => !open)} title="Attach file" aria-label="Attach file">
              <Paperclip size={20} />
            </button>
            {showAttachmentMenu && (
              <div className="composer-popover attachment-menu">
                {[
                  ["Photo", "image/*"],
                  ["Video", "video/*"],
                  ["Document", ".pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx"],
                  ["File", "*/*"],
                ].map(([label, accept]) => (
                  <button key={label} type="button" onClick={() => chooseAttachment(accept)}>{label}</button>
                ))}
              </div>
            )}
          </div>

          <textarea
            className="chat-input-field"
            placeholder="Type a message..."
            rows={1}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />

          <div className="composer-menu-anchor">
            <button className="icon-btn composer-tool-btn emoji-picker-trigger" onClick={() => setShowEmojiPicker((open) => !open)} title="Choose emoji" aria-label="Choose emoji">
              <Smile size={20} />
            </button>
            {showEmojiPicker && (
              <div className="composer-popover emoji-picker">
                {["😀", "😂", "🥰", "👍", "❤️", "🎉", "🙏", "😊", "😮", "🔥", "😭", "🤔"].map((emoji) => (
                  <button key={emoji} type="button" aria-label={`Insert ${emoji}`} onClick={() => {
                    setInputText((value) => `${value}${emoji}`);
                    setShowEmojiPicker(false);
                  }}>{emoji}</button>
                ))}
              </div>
            )}
          </div>

          <button className="send-btn" onClick={handleSend} disabled={(!inputText.trim() && !attachment) || isUploading} title="Send message" aria-label="Send message">
            <Send size={18} />
          </button>
        </div>
        {sendFailed && (
          <div role="alert" style={{ color: "var(--danger, #D9534F)", fontSize: "0.8rem", padding: "4px 12px" }}>
            Message wasn’t sent. Check your connection and try again.
          </div>
        )}
      </div>
      {showSentToast && <div className="toast-notification" role="status"><CheckCircle size={18} /> Message sent</div>}
    </div>
  );
}
