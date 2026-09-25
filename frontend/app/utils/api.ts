const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000");
const API_ORIGIN = configuredApiUrl.replace(/\/+$/, "");

export const API_BASE = `${API_ORIGIN}/api`;
const sameOriginWs = typeof window === "undefined"
  ? ""
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
export const WS_BASE = (
  process.env.NEXT_PUBLIC_WS_URL || (API_ORIGIN ? `${API_ORIGIN.replace(/^http/i, "ws")}/ws` : sameOriginWs)
).replace(/\/+$/, "");
