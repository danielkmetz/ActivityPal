export const isInvite = (post) =>
  (post?.type || post?.postType) === 'invite';

export const isReplay = (post) =>
  post?.type === 'hls' && post?.playbackUrl;

export const isLive = (post) =>
  ['live', 'liveStream', 'live-session'].includes(post?.type) || post?.isLive === true;

export const isSharedPost = (post) =>
  post?.type === 'sharedPost' || post?.__typename === 'SharedPost';
