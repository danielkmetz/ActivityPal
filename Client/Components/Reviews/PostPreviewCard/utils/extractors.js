export const pickFirstUrl = (m) => {
  if (!m) return null;
  if (typeof m === 'string') return m;
  return m.url || m.uri || m.playbackUrl || m.mediaUrl || m.media?.url || null;
};

export const firstOf = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);

export const safeUserName = (u) => {
  if (!u) return '';
  const f = u.firstName || '';
  const l = u.lastName || '';
  const c = `${f} ${l}`.trim();
  return c || '';
};

export const safeBusinessLabel = (obj, fallbackBusinessName) =>
  obj?.businessName || obj?.placeName || fallbackBusinessName || null;
