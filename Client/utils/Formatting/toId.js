export function toId(v) {
  if (!v) return null;

  // already an id string
  if (typeof v === "string") return v;

  // common id fields on objects
  if (typeof v === "object") {
    return toId(v._id || v.id || v.userId);
  }

  return null;
}
