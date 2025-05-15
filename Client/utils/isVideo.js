export const isVideo = (file) => {
  if (typeof file !== "object" || !file) return false;

  const uri = file?.uri || file?.url || file.mediaUrl || file.mediaUploadUrl || "";
  const key = file?.photoKey?.toLowerCase?.() || "";

  return (
    file?.type?.startsWith?.("video/") ||
    key.endsWith(".mov") ||
    key.endsWith(".mp4") ||
    uri.toLowerCase().includes(".mov") ||
    uri.toLowerCase().includes(".mp4")
  );
};
