"use client";

import { useState } from "react";
import { Search, Plus, UserPlus, Users, MoreVertical, Star, Archive, ArchiveRestore } from "lucide-react";
import { formatKolkataShortDate, formatKolkataTime, isSameKolkataDay, parseProjectTimestamp } from "../utils/dateTime";

export interface Conversation {
  id: number;
  type: "direct" | "group";
  name: string;
  avatar_url?: string;
  disappearing_timer: number;
  updated_at: string;
  members: any[];
  last_message?: {
    id: number;
    content: string;
    created_at: string;
    sender_name: string;
    status: string;
  };
  unread_count: number;
  is_favorite?: boolean;
  is_archived?: boolean;
  other_user?: {
    id: number;
    display_name: string;
    identifier?: string;
    is_online: boolean;
    last_seen?: string | null;
    safety_number?: string;
  };
}

interface SidebarProps {
  currentUser: any;
  conversations: Conversation[];
  activeConvId: number | null;
  onSelectConv: (conv: Conversation) => void;
  onOpenNewMessage: () => void;
  onOpenNewContact: () => void;
  onOpenNewGroup: () => void;
  onOpenSettings: () => void;
  archiveMode?: boolean;
  className?: string;
  onToggleFavorite?: (id: number, value: boolean) => void;
  onToggleArchive?: (id: number, value: boolean) => void;
}

export default function Sidebar({
  currentUser,
  conversations,
  activeConvId,
  onSelectConv,
  onOpenNewMessage,
  onOpenNewContact,
  onOpenNewGroup,
  onOpenSettings,
  archiveMode = false,
  className = "",
  onToggleFavorite,
  onToggleArchive,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "favourites" | "groups">("all");

  const filteredConversations = conversations.filter((conv) => {
    if (Boolean(conv.is_archived) !== archiveMode) return false;
    const query = searchQuery.trim().toLowerCase();
    const searchableText = [
      conv.name,
      conv.other_user?.identifier,
      conv.last_message?.content,
      ...(conv.members || []).flatMap((member) => [member.display_name, member.identifier]),
    ].filter(Boolean).join(" ").toLowerCase();
    const matchesSearch = searchableText.includes(query);

    if (!matchesSearch) return false;

    if (filterTab === "unread") return conv.unread_count > 0;
    if (filterTab === "favourites") return Boolean(conv.is_favorite);
    if (filterTab === "groups") return conv.type === "group";
    return true;
  });

  function formatTime(isoStr?: string) {
    if (!isoStr) return "";
    const date = parseProjectTimestamp(isoStr);
    if (!date) return "";
    const now = new Date();
    if (isSameKolkataDay(date, now)) {
      return formatKolkataTime(isoStr);
    }
    return formatKolkataShortDate(isoStr);
  }

  return (
    <div className={`sidebar ${className}`}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="sidebar-profile">
          <div className="sidebar-profile-avatar">
            {currentUser.avatar_url ? <img src={currentUser.avatar_url} alt={currentUser.display_name} /> : <span>{currentUser.display_name?.charAt(0)?.toUpperCase()}</span>}
          </div>
          <div className="sidebar-profile-copy"><strong>{currentUser.display_name}</strong><span>Signal</span></div>

        <div className="sidebar-actions">
          <button className="icon-btn" onClick={onOpenNewContact} title="Add Contact">
            <UserPlus size={18} />
          </button>
          <button className="icon-btn" onClick={onOpenSettings} title="Profile and settings">
            <MoreVertical size={20} />
          </button>
        </div>
        </div>
      </div>

      <button className="new-message-sidebar-btn" onClick={onOpenNewMessage}>
        <Plus size={18} /> New Message
      </button>
      {archiveMode && <div className="archive-list-heading">Archived chats</div>}

      {/* Search Box */}
      <div className="sidebar-search-container">
        <div className="search-box">
          <Search size={16} />
          <input
            className="search-input"
            type="text"
            placeholder="Search or start a new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Pills matching screenshot */}
        <div className="filter-tabs">
          <button
            className={`tab-btn ${filterTab === "all" ? "active" : ""}`}
            onClick={() => setFilterTab("all")}
          >
            All
          </button>
          <button
            className={`tab-btn ${filterTab === "unread" ? "active" : ""}`}
            onClick={() => setFilterTab("unread")}
          >
            Unread {conversations.reduce((acc, c) => acc + (c.unread_count > 0 ? 1 : 0), 0) > 0 && `(${conversations.reduce((acc, c) => acc + (c.unread_count > 0 ? 1 : 0), 0)})`}
          </button>
          <button
            className={`tab-btn ${filterTab === "favourites" ? "active" : ""}`}
            onClick={() => setFilterTab("favourites")}
          >
            Favourites
          </button>
          <button
            className={`tab-btn ${filterTab === "groups" ? "active" : ""}`}
            onClick={() => setFilterTab("groups")}
          >
            Groups
          </button>
          <button
            className="tab-btn"
            onClick={onOpenNewGroup}
            title="Create New Group"
          >
            +
          </button>
        </div>
      </div>

      {/* Conversations Scroll List */}
      <div className="conversations-scroll">
        {filteredConversations.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            No conversations found.
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConvId;
            const isOnline = conv.type === "direct" && conv.other_user?.is_online;

            return (
              <div
                key={conv.id}
                className={`conv-item ${isActive ? "active" : ""}`}
                onClick={() => onSelectConv(conv)}
              >
                <div className="avatar-wrapper">
                  {conv.avatar_url ? (
                    <img className="avatar-img" src={conv.avatar_url} alt={conv.name} />
                  ) : (
                    <div className="avatar-fallback">
                      {conv.type === "group" ? <Users size={18} /> : conv.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {isOnline && <div className="online-indicator" />}
                </div>

                <div className="conv-details">
                  <div className="conv-top-row">
                    <span className="conv-title">{conv.name}</span>
                    <span className="conv-time">{formatTime(conv.updated_at || conv.last_message?.created_at)}</span>
                  </div>

                  <div className="conv-bottom-row">
                    <span className="conv-snippet">
                      {conv.last_message ? (
                        <>
                          {conv.type === "group" && <strong>{conv.last_message.sender_name}: </strong>}
                          {conv.last_message.content}
                        </>
                      ) : (
                        <em>No messages yet</em>
                      )}
                    </span>

                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {conv.unread_count > 0 && <div className="unread-badge">{conv.unread_count}</div>}
                    </div>
                  </div>
                </div>
                <div className="conversation-row-actions" onClick={(event) => event.stopPropagation()}>
                  {!archiveMode && <button className={`icon-btn ${conv.is_favorite ? "favorite-active" : ""}`} title={conv.is_favorite ? "Remove from favourites" : "Add to favourites"} aria-label={conv.is_favorite ? "Remove from favourites" : "Add to favourites"} onClick={() => onToggleFavorite?.(conv.id, !conv.is_favorite)}><Star size={16} fill={conv.is_favorite ? "currentColor" : "none"} /></button>}
                  <button className="icon-btn" title={archiveMode ? "Unarchive chat" : "Archive chat"} aria-label={archiveMode ? "Unarchive chat" : "Archive chat"} onClick={() => onToggleArchive?.(conv.id, !archiveMode)}>{archiveMode ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
