const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_ORIGIN = configuredApiUrl.replace(/\/+$/, "");

export const API_BASE = `${API_ORIGIN}/api`;
export const WS_BASE = (
  process.env.NEXT_PUBLIC_WS_URL || `${API_ORIGIN.replace(/^http/i, "ws")}/ws`
).replace(/\/+$/, "");
