const VIDEO_EXTS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.m3u8'];

export const isVideo = (file) => {
  if (!file) return false;

  // Normalize possible shapes: object or string
  let uri = '';
  let mime = '';
  let key = '';

  if (typeof file === 'string') {
    uri = file;
  } else if (typeof file === 'object') {
    uri =
      file?.uri ||
      file?.url ||
      file?.mediaUrl ||
      file?.mediaUploadUrl ||
      file?.media?.url ||
      '';
    mime = file?.type || file?.mimeType || file?.contentType || '';
    key =
      file?.photoKey ||
      file?.media?.photoKey ||
      file?.key ||
      '';
  }

  const cleanUri = (uri || '').split(/[?#]/)[0].toLowerCase();
  const lowerKey = (key || '').toLowerCase();
  const lowerMime = (mime || '').toLowerCase();

  // MIME says it's a video (covers cases with no extension)
  if (lowerMime.startsWith('video/')) return true;
  // Some iOS cameras report QuickTime containers
  if (lowerMime.includes('quicktime')) return true;
  // HLS sometimes reported as application/x-mpegURL
  if (lowerMime.includes('mpegurl') || lowerMime.includes('x-mpegurl')) return true;

  // Check known video extensions on either key or uri
  return VIDEO_EXTS.some(ext => lowerKey.endsWith(ext) || cleanUri.endsWith(ext));
};
