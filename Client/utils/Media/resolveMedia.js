import { resolvePostContent } from '../posts/resolvePostContent';

export function pickRawMedia(postContent, bannerPresignedUrl) {
  if (Array.isArray(postContent?.photos) && postContent.photos.length > 0) return postContent.photos;
  if (Array.isArray(postContent?.media) && postContent.media.length > 0) return postContent.media;

  // ✅ support single mediaUrl patterns used in previews
  if (postContent?.mediaUrl) return postContent.mediaUrl;

  if (postContent?.bannerUrl) return postContent.bannerUrl;
  if (bannerPresignedUrl) return bannerPresignedUrl;
  if (postContent?.details?.playbackUrl) return postContent.details.playbackUrl;
  return null;
}

export function toMediaArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw) return [raw];
  return [];
}

export function resolveMediaList(post, bannerPresignedUrl) {
  const postContent = resolvePostContent(post);
  const raw = pickRawMedia(postContent, bannerPresignedUrl);
  return toMediaArray(raw);
}

// --------------------
// ✅ New: one-stop preview resolver for thumbnails
// --------------------
function extractUri(item) {
  if (!item) return null;
  if (typeof item === 'string') return item;
  return item.url || item.uri || item.playbackUrl || item.signedUrl || null;
}

function inferKind(item, uri, postContent) {
  // strongest signal in your model
  if (postContent?.details?.playbackUrl) return 'video';

  const t = String(item?.mediaType || item?.type || postContent?.mediaType || '').toLowerCase();
  if (t === 'video') return 'video';
  if (t === 'image') return 'image';

  const mt = String(item?.mimeType || item?.contentType || '').toLowerCase();
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('image/')) return 'image';

  const u = String(uri || '').toLowerCase();
  if (u.endsWith('.mp4') || u.endsWith('.mov') || u.includes('.m3u8')) return 'video';

  return 'image';
}

export function resolvePreviewMedia(post, bannerPresignedUrl) {
  const postContent = resolvePostContent(post);

  // primary
  const list = toMediaArray(pickRawMedia(postContent, bannerPresignedUrl));
  const first = list[0];
  const uri = extractUri(first);
  if (uri) return { kind: inferKind(first, uri, postContent), uri };

  // ✅ shared post fallback (if your shared posts store preview media under shared.originalPreview)
  const op = post?.shared?.originalPreview;
  if (op) {
    const opContent = resolvePostContent(op);
    const opList = toMediaArray(pickRawMedia(opContent, bannerPresignedUrl));
    const opFirst = opList[0];
    const opUri = extractUri(opFirst);
    if (opUri) return { kind: inferKind(opFirst, opUri, opContent), uri: opUri };
  }

  return { kind: 'none', uri: null };
}
