export const pickMediaArray = (post) => {
  const postContent = post?.original ?? post ?? {};
  const raw =
    (Array.isArray(postContent?.photos) && postContent.photos.length && postContent.photos) ||
    (Array.isArray(postContent?.media) && postContent.media.length && postContent.media) ||
    (postContent?.bannerUrl ? [postContent.bannerUrl] : []) ||
    (postContent?.details?.playbackUrl ? [postContent.details.playbackUrl] : []) ||
    [];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
};