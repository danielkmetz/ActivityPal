export const pickPostId = (e) =>
  e?._id || e?.id || e?.postId || e?.linkedPostId || e?.eventId || e?.promotionId || null;

export const typeFromKind = (k = '') => {
  const s = String(k).toLowerCase();
  if (s.includes('promo')) return 'promotion'; // singular; normalizer will pluralize
  if (s.includes('event')) return 'event';
  return undefined;
};
