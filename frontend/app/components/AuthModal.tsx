"use client";

import { useState, useEffect, FormEvent } from "react";
import {
  Lock, ShieldCheck, ArrowRight, User, Phone, CheckCircle, Sparkles,
  Sun, Moon, MessageSquare, Video, Mic, CheckCheck, X, Shield, Users
} from "lucide-react";

type UserType = {
  id: number;
  identifier: string;
  display_name: string;
  avatar_url?: string;
  status_message?: string;
  is_online?: boolean;
  safety_number?: string;
};

interface AuthModalProps {
  onLoginSuccess: (user: UserType) => void;
}

export default function AuthModal({ onLoginSuccess }: AuthModalProps) {
  // Modal states: null = viewing landing page, 'login' = login modal, 'register' = register modal
  const [activeModal, setActiveModal] = useState<"login" | "register" | null>(null);
  const [stage, setStage] = useState<"identifier" | "verify">("identifier");

  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("123456");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [registrationAvailability, setRegistrationAvailability] = useState<"idle" | "checking" | "available" | "taken" | "error">("idle");
  const [checkedRegistrationIdentifier, setCheckedRegistrationIdentifier] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const API = "http://localhost:8000/api/auth";

  useEffect(() => {
    const value = identifier.trim();
    if (activeModal !== "register" || stage !== "identifier" || !value) {
      setRegistrationAvailability("idle");
      setCheckedRegistrationIdentifier("");
      return;
    }

    let cancelled = false;
    setCheckedRegistrationIdentifier("");
    setRegistrationAvailability("checking");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: value, is_registration: true }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not check this identifier.");
        if (cancelled) return;
        setCheckedRegistrationIdentifier(value);
        setUsernameSuggestions(data.is_new_user ? [] : data.suggestions ?? []);
        setRegistrationAvailability(data.is_new_user ? "available" : "taken");
      } catch {
        if (!cancelled) {
          setCheckedRegistrationIdentifier(value);
          setRegistrationAvailability("error");
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeModal, stage, identifier]);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }

  function openLogin() {
    setError("");
    setUsernameSuggestions([]);
    setRegistrationAvailability("idle");
    setIdentifier("");
    setStage("identifier");
    setIsNewUser(false);
    setActiveModal("login");
  }

  function openRegister() {
    setError("");
    setUsernameSuggestions([]);
    setRegistrationAvailability("idle");
    setIdentifier("");
    setDisplayName("");
    setStage("identifier");
    setIsNewUser(true);
    setActiveModal("register");
  }

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    if (activeModal === "register" && (registrationAvailability !== "available" || checkedRegistrationIdentifier !== identifier.trim())) return;
    setError("");
    setBusy(true);

    try {
      const res = await fetch(`${API}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), is_registration: activeModal === "register" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unable to start registration.");
      if (activeModal === "register" && !data.is_new_user) {
        setUsernameSuggestions(data.suggestions ?? []);
        setCheckedRegistrationIdentifier(identifier.trim());
        setRegistrationAvailability("taken");
        setError("Username/phone number already exists.");
        return;
      }
      setUsernameSuggestions([]);
      setIsNewUser(data.is_new_user);
      if (data.is_new_user && !displayName) {
        setDisplayName(identifier.split("@")[0] || identifier.replace(/\+/g, ""));
      }
      setStage("verify");
    } catch (err: any) {
      setError(err.message || "Failed to connect to API server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const res = await fetch(`${API}/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          otp: otp.trim(),
          display_name: isNewUser ? displayName.trim() || identifier : null,
          avatar_url: avatarUrl.trim() || null,
          is_registration: activeModal === "register",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && activeModal === "register") {
          const suggestion = String(data.detail || "").match(/Try (.+) instead\./)?.[1];
          setUsernameSuggestions(suggestion ? [suggestion] : []);
          setStage("identifier");
        }
        throw new Error(data.detail || "Invalid verification code.");
      }
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing-container" data-theme={theme}>
      {/* Top Navigation Bar */}
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="Signal home">
          <ShieldCheck size={32} />
          <span>Signal</span>
        </a>

        <nav className="landing-links" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#privacy">Privacy</a>
          <a href="#about">About</a>
        </nav>

        <div className="landing-nav-actions">
          {/* R: Register button */}
          <button className="nav-btn" onClick={openRegister} title="Register New Account">
            <UserPlusIcon /> Register
          </button>

          {/* L: Login button */}
          <button className="nav-btn" onClick={openLogin} title="Login to Account">
            <User size={16} /> Login
          </button>

          {/* M: Mode switch button */}
          <button className="nav-btn" onClick={toggleTheme} title="Toggle Light / Dark Mode">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>
      </header>

      {/* Main Landing Hero Content */}
      <main id="top" className="landing-hero">
        {/* Left Hero Section */}
        <div className="hero-left">
          <p className="hero-eyebrow">Private messaging, simplified</p>
          <h1>Speak <span>Freely.</span></h1>
          <p className="hero-description">
            A calmer way to keep in touch, with real-time conversations and the controls you need to make them yours.
          </p>
          <div className="hero-cta-group">
            <button className="hero-login-btn" onClick={openRegister}>
              <span>Start Messaging</span>
              <ArrowRight size={19} />
            </button>
            <p className="hero-login-prompt">Already have an account? <button type="button" onClick={openLogin}>Login</button></p>
          </div>
        </div>

        {/* Right Phone Mockups Visual Section */}
        <div className="hero-right">
          <div className="privacy-aura" aria-hidden="true" />
          {/* Left Phone Mockup: Video Call UI */}
          <div className="phone-mockup phone-left">
            <div className="phone-notch" />
            <div className="phone-screen" style={{ background: "#121824", gap: 12 }}>
              <div style={{ fontSize: "0.7rem", color: "#3A8F6D", textAlign: "center", fontWeight: 600 }}>
                  SIGNAL VIDEO CALL
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flex: 1 }}>
                <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120" style={{ width: "100%", height: "100%", borderRadius: 12, objectFit: "cover" }} alt="User 1" />
                <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120" style={{ width: "100%", height: "100%", borderRadius: 12, objectFit: "cover" }} alt="User 2" />
                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120" style={{ width: "100%", height: "100%", borderRadius: 12, objectFit: "cover" }} alt="User 3" />
                <img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120" style={{ width: "100%", height: "100%", borderRadius: 12, objectFit: "cover" }} alt="User 4" />
              </div>
            </div>
          </div>

          {/* Right Phone Mockup: Dark Mode Encrypted Chat UI */}
          <div className="phone-mockup phone-right">
            <div className="phone-notch" />
            <div className="phone-screen">
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: "1px solid #2D2D30" }}>
                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80" style={{ width: 28, height: 28, borderRadius: "50%" }} alt="Moya" />
                <div>
                  <div style={{ fontSize: "0.8rem", color: "#fff", fontWeight: 600 }}>Moya Johnson</div>
                  <div style={{ fontSize: "0.65rem", color: "#3A8F6D" }}>Available now</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, fontSize: "0.75rem" }}>
                <div style={{ background: "#3A8F6D", color: "#fff", padding: "8px 12px", borderRadius: "14px 14px 2px 14px", alignSelf: "flex-end", maxWidth: "80%" }}>
                  I&apos;m on my way! What&apos;s the address?
                </div>
                <div style={{ background: "#2A2A2D", color: "#F2F2F7", padding: "8px 12px", borderRadius: "14px 14px 14px 2px", alignSelf: "flex-start", maxWidth: "80%" }}>
                  We&apos;re at 118 64th Ave. 📍
                </div>
                <div style={{ background: "#3A8F6D", color: "#fff", padding: "8px 12px", borderRadius: "14px 14px 2px 14px", alignSelf: "flex-end", maxWidth: "80%" }}>
                  Is there a buzzer? Don&apos;t want to ruin the surprise! 🎉
                </div>
              </div>
            </div>
          </div>

          <div className="floating-message-card floating-privacy">
            <span className="floating-card-icon"><Lock size={16} /></span>
            <span><strong>Private by design</strong><small>Your conversations, your space</small></span>
          </div>
          <div className="floating-message-card floating-online">
            <span className="online-dot" />
            <span><strong>Online now</strong><small>Ready to connect</small></span>
          </div>
          <div className="floating-message-card floating-delivered">
            <span className="floating-card-icon delivered"><CheckCheck size={17} /></span>
            <span><strong>Message delivered</strong><small>Right on time</small></span>
          </div>
        </div>
      </main>

      <section id="features" className="landing-features" aria-label="Messaging features">
        <article id="privacy" className="landing-feature-card">
          <span className="feature-icon"><Lock size={19} /></span>
          <div><h2>Private conversations</h2><p>Personal chats with account and read-receipt controls.</p></div>
        </article>
        <article className="landing-feature-card">
          <span className="feature-icon"><MessageSquare size={19} /></span>
          <div><h2>Real-time messaging</h2><p>Messages and typing updates arrive as they happen.</p></div>
        </article>
        <article className="landing-feature-card">
          <span className="feature-icon"><Users size={19} /></span>
          <div><h2>Group conversations</h2><p>Keep conversations with your people in one place.</p></div>
        </article>
      </section>

      <footer id="about" className="landing-footer">
        <span><ShieldCheck size={16} /> Signal-inspired messaging</span>
        <span>Made for conversations that matter.</span>
      </footer>

      {/* Interactive Modal Popup (Login / Register) */}
      {activeModal && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="auth-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="auth-logo" style={{ width: 40, height: 40, margin: 0 }}>
                  <ShieldCheck size={24} />
                </div>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                  {activeModal === "login" ? "Login to Signal" : "Create Signal Account"}
                </h2>
              </div>
              <button className="icon-btn" onClick={() => setActiveModal(null)}>
                <X size={18} />
              </button>
            </div>

            {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

            {stage === "identifier" ? (
              <form className="auth-form" onSubmit={handleStart}>
                <div className="form-group">
                  <label>Phone Number or Username</label>
                  <input
                    className="input-field"
                    type="text"
                    placeholder="e.g. +15550100 or alex"
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      setCheckedRegistrationIdentifier("");
                      setError("");
                      setUsernameSuggestions([]);
                    }}
                    required
                    autoFocus
                  />
                  {activeModal === "register" && registrationAvailability === "taken" && (
                    <p className="identifier-availability-error" role="alert">Username/phone number already exists.</p>
                  )}
                  {activeModal === "register" && registrationAvailability === "checking" && identifier.trim() && (
                    <p className="identifier-availability-status" aria-live="polite">Checking availability...</p>
                  )}
                  {activeModal === "register" && registrationAvailability === "error" && (
                    <p className="identifier-availability-error" role="alert">Could not check this username/phone number. Try again.</p>
                  )}
                </div>

                {usernameSuggestions.length > 0 && (
                  <div className="form-group">
                    <label>Available username suggestions</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {usernameSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setIdentifier(suggestion);
                            setError("");
                            setUsernameSuggestions([]);
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeModal === "register" && (
                  <div className="form-group">
                    <label>Display Name</label>
                    <input
                      className="input-field"
                      type="text"
                      placeholder="e.g. Divyxshu"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="auth-demo-badge">
                  <Sparkles size={16} />
                  <span>Demo Users: <strong>+15550100</strong> or <strong>+15550101</strong></span>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Quick select:</span>
                  {["+15550100", "+15550101", "+15550102"].map((num) => (
                    <button
                      key={num}
                      type="button"
                      className="btn-secondary"
                      style={{ height: 26, padding: "0 8px", fontSize: "0.75rem" }}
                      onClick={() => setIdentifier(num)}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                <button className="btn-primary" type="submit" disabled={busy || (activeModal === "register" && (registrationAvailability !== "available" || checkedRegistrationIdentifier !== identifier.trim()))}>
                  {busy || (activeModal === "register" && registrationAvailability === "checking") ? "Checking..." : <>Continue <ArrowRight size={18} /> </>}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleVerify}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "fit-content", marginBottom: 6 }}
                  onClick={() => setStage("identifier")}
                >
                  ← Back
                </button>

                <div className="form-group">
                  <label>6-Digit Demo Verification Code</label>
                  <input
                    className="input-field"
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                  />
                </div>

                <div className="auth-demo-badge">
                  <CheckCircle size={16} />
                  <span>Demo Code: <strong>123456</strong></span>
                </div>

                <button className="btn-primary" type="submit" disabled={busy}>
                  {busy ? "Verifying..." : <>Enter Signal <ArrowRight size={18} /></>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="17" y1="11" x2="23" y2="11" />
    </svg>
  );
}
