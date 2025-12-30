export const getValidPostType = (post) => {
  if (['review', 'check-in', 'invite', 'activityInvite', 'liveStream'].includes(post?.type)) {
    return post.type;
  }

  const kind = post?.kind?.toLowerCase?.() || '';
  if (kind.includes('event')) return 'event';
  if (kind.includes('promotion')) return 'promotion';
  if (kind.includes('promo')) return 'promotion';

  throw new Error(`Unsupported post type: type="${post?.type}", kind="${post?.kind}"`);
};
