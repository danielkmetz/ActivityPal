// Null-safe ISO helpers
export function toIsoDateString(d) {
  if (!d) return undefined;               // ⬅ return undefined if nullish
  const iso = new Date(d).toISOString();  // 2025-08-11T17:23:45.000Z
  return iso;                             // keep full ISO (you slice later)
}

export function toYMD(d) {
  const iso = toIsoDateString(d);
  return iso ? iso.slice(0, 10) : undefined; // "YYYY-MM-DD"
}

export function computeRange(preset) {
  const now = new Date();
  switch (preset) {
    case 'all':
      return { start: null, end: null }; // no bounds
    case '7d':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), end: now };
    case '30d':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), end: now };
    case '90d':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89), end: now };
    case 'ytd': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: now };
    }
    default:
      return { start: null, end: null };
  }
}
