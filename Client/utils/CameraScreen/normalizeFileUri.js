export const normalizeFileUri = (u = "") => {
  if (!u) return u;
  const collapsed = u.replace(/^file:\/+file:\/+/, "file://");
  return collapsed.replace(/^file:\/{2,}/, "file:///");
};
