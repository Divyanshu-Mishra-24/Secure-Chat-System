export const PROJECT_TIME_ZONE = "Asia/Kolkata";

/** Database timestamps are naive ISO strings in UTC; parse them as UTC explicitly. */
export function parseProjectTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(" ", "T");
  if (!normalized) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasZone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function kolkataDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROJECT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatKolkataTime(value?: string | null): string {
  const date = parseProjectTimestamp(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: PROJECT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatKolkataShortDate(value?: string | null): string {
  const date = parseProjectTimestamp(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: PROJECT_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(date);
}

export function isSameKolkataDay(left: Date, right: Date): boolean {
  return kolkataDateKey(left) === kolkataDateKey(right);
}
