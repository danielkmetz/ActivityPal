export const getMediaKey = (m) => m.localKey || m.photoKey || m.uri || m._id;

export const mergeMedia = (prev = [], incoming = []) => {
  const seen = new Set();
  const merged = [...prev, ...incoming];
  return merged.filter((m) => {
    const k = getMediaKey(m);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};