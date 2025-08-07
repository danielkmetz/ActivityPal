export const isVideo = (file) => {
  if (typeof file !== 'object' || !file) return false;

  const uri = file?.uri || file?.url || file?.mediaUrl || file?.mediaUploadUrl || file?.media?.url || '';
  const key = file?.photoKey?.toLowerCase?.() || file?.media?.photoKey || '';

  // ✅ Strip query params from URI
  const cleanUri = uri.split('?')[0].toLowerCase();

  return (
    file?.type?.startsWith?.('video/') ||
    key.endsWith('.mov') ||
    key.endsWith('.mp4') ||
    cleanUri.endsWith('.mov') ||
    cleanUri.endsWith('.mp4')
  );
};
