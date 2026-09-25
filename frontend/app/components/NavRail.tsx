"use client";

import { MessageSquare, Circle, Users, Archive, Settings, Moon, Sun } from "lucide-react";

interface NavRailProps {
  currentUser: any;
  activeTab: "chats" | "status" | "users" | "archive";
  onSelectTab: (tab: "chats" | "status" | "users" | "archive") => void;
  unreadTotal: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export default function NavRail({
  currentUser,
  activeTab,
  onSelectTab,
  unreadTotal,
  theme,
  onToggleTheme,
  onOpenSettings,
}: NavRailProps) {
  return (
    <div className="nav-rail">
      {/* Top Section */}
      <div className="nav-rail-top">
        {/* Chats Tab */}
        <button
          className={`nav-rail-btn ${activeTab === "chats" ? "active" : ""}`}
          onClick={() => onSelectTab("chats")}
          title="Chats"
        >
          <MessageSquare size={20} />
          {unreadTotal > 0 && (
            <span className="nav-rail-badge">{unreadTotal > 99 ? "99+" : unreadTotal}</span>
          )}
        </button>

        {/* Yellow Circle: Status & Stories (Coming Soon) */}
        <button
          className={`nav-rail-btn ${activeTab === "status" ? "active" : ""}`}
          onClick={() => onSelectTab("status")}
          title="Status & Stories (Coming Soon)"
        >
          <Circle size={20} />
        </button>

        {/* Black Users: Connected Users & Contacts List */}
        <button
          className={`nav-rail-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => onSelectTab("users")}
          title="Connected Users & Contacts"
        >
          <Users size={20} />
        </button>

        {/* Archive */}
        <button
          className={`nav-rail-btn ${activeTab === "archive" ? "active" : ""}`}
          onClick={() => onSelectTab("archive")}
          title="Archived Chats"
        >
          <Archive size={20} />
        </button>
      </div>

      {/* Bottom Section */}
      <div className="nav-rail-bottom">
        <button className="nav-rail-btn" onClick={onToggleTheme} title="Toggle Dark/Light Mode">
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button className="nav-rail-btn" onClick={onOpenSettings} title="Settings">
          <Settings size={20} />
        </button>

        <div className="nav-rail-avatar" onClick={onOpenSettings} title={currentUser.display_name}>
          {currentUser.avatar_url ? (
            <img src={currentUser.avatar_url} alt={currentUser.display_name} />
          ) : (
            <div>{currentUser.display_name?.charAt(0).toUpperCase()}</div>
          )}
        </div>
      </div>
    </div>
  );
}
