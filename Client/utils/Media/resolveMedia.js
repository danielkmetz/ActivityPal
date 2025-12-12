import { resolvePostContent } from '../posts/resolvePostContent';

export function pickRawMedia(postContent, bannerPresignedUrl) {
  if (Array.isArray(postContent?.photos) && postContent.photos.length > 0) return postContent.photos;
  if (Array.isArray(postContent?.media) && postContent.media.length > 0) return postContent.media;
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