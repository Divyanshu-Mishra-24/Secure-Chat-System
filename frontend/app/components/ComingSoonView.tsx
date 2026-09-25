"use client";

import { Sparkles, Circle, Lock, Clock, Eye } from "lucide-react";

export default function ComingSoonView() {
  return (
    <div
      style={{
        flex: 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-dark)",
        padding: 32,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "rgba(255, 204, 0, 0.15)",
          color: "#FFCC00",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
          boxShadow: "0 8px 24px rgba(255, 204, 0, 0.2)",
        }}
      >
        <Circle size={40} />
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255, 204, 0, 0.15)",
          color: "#FFCC00",
          border: "1px solid rgba(255, 204, 0, 0.3)",
          padding: "4px 12px",
          borderRadius: "var(--radius-full)",
          fontSize: "0.8rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 12,
        }}
      >
        <Sparkles size={14} /> Coming Soon
      </div>

      <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: 10 }}>
        Signal Stories &amp; Status
      </h1>

      <p style={{ fontSize: "1rem", color: "var(--text-secondary)", maxWidth: 460, lineHeight: 1.5, marginBottom: 32 }}>
        Share end-to-end encrypted photos, videos, and text updates with your connected contacts that automatically expire after 24 hours.
      </p>

      {/* Feature Preview Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, maxWidth: 640, width: "100%" }}>
        <div style={{ background: "var(--panel-bg)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: 18, textAlign: "left" }}>
          <Lock size={22} style={{ color: "var(--signal-green)", marginBottom: 8 }} />
          <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>Privacy Controlled</h4>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
            Choose exactly who gets to view your stories. No trackers or ad profiles.
          </p>
        </div>

        <div style={{ background: "var(--panel-bg)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: 18, textAlign: "left" }}>
          <Clock size={22} style={{ color: "var(--signal-blue)", marginBottom: 8 }} />
          <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>24-Hour Expiry</h4>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
            All posted stories automatically self-destruct after 24 hours.
          </p>
        </div>

        <div style={{ background: "var(--panel-bg)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: 18, textAlign: "left" }}>
          <Eye size={22} style={{ color: "#A855F7", marginBottom: 8 }} />
          <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>Read Receipts</h4>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
            View real-time view counts and see who looked at your status updates.
          </p>
        </div>
      </div>
    </div>
  );
}
