const VIDEO_EXTS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.m3u8'];

export const isVideo = (file) => {
  if (!file) return false;

  let uri = '';
  let mime = '';
  let key  = '';

  if (typeof file === 'string') {
    uri = file;
  } else if (typeof file === 'object') {
    const details = file.details || {};

    uri =
      file?.uri ||
      file?.url ||
      file?.mediaUrl ||
      file?.mediaUploadUrl ||
      file?.media?.url ||
      file?.vodUrl ||
      file?.playbackUrl ||
      details?.playbackUrl ||
      '';
    mime =
      file?.type ||
      file?.mimeType ||
      file?.contentType ||
      '';
    key =
      file?.photoKey ||
      file?.media?.photoKey ||
      file?.key ||
      '';
  }

  const cleanUri   = (uri || '').split(/[?#]/)[0].toLowerCase();
  const lowerKey   = (key || '').toLowerCase();
  const lowerMime  = (mime || '').toLowerCase();

  // MIME flags
  if (lowerMime.startsWith('video/')) return true;
  if (lowerMime === 'hls') return true;
  if (lowerMime.includes('quicktime')) return true;
  if (lowerMime.includes('mpegurl') || lowerMime.includes('x-mpegurl')) return true;

  // Extensions on either key or uri
  return VIDEO_EXTS.some(
    (ext) => lowerKey.endsWith(ext) || cleanUri.endsWith(ext)
  );
};
