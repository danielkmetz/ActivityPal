import { createSelector } from '@reduxjs/toolkit';
import { selectUser } from '../UserSlice';

/* -------------------------- base posts selectors ------------------------- */

const selectPostsState = (state) => state.posts || {};

export const selectProfilePosts = (state) =>
  selectPostsState(state).profilePosts || [];

export const selectBusinessPosts = (state) =>
  selectPostsState(state).businessPosts || [];

export const selectOtherUserPosts = (state) =>
  selectPostsState(state).otherUserPosts || [];

export const selectUserAndFriendsPosts = (state) =>
  selectPostsState(state).userAndFriendsPosts || [];

export const selectSuggestedPosts = (state) =>
  selectPostsState(state).suggestedPosts || [];

export const selectLocalPosts = (state) =>
  selectPostsState(state).localPosts || [];

export const selectHasFetchedOnce = (state) =>
  !!selectPostsState(state).hasFetchedOnce;

export const selectLoading = (state) =>
  selectPostsState(state).loading || 'idle';

export const selectError = (state) =>
  selectPostsState(state).error || null;

export const selectSelectedPost = (state) =>
  selectPostsState(state).selectedPost || null;

export const selectUserAndFriendsRefreshNonce = (state) =>
  selectPostsState(state).userAndFriendsRefreshNonce ?? null;

/* --------------------- combined / cross-collection selectors --------------------- */

export const selectAllPosts = createSelector(
  [
    selectBusinessPosts,
    selectUserAndFriendsPosts,
    selectOtherUserPosts,
    selectProfilePosts,
    selectSuggestedPosts,
  ],
  (business, userAndFriends, otherUser, profile, suggested) => [
    ...business,
    ...userAndFriends,
    ...otherUser,
    ...profile,
    ...suggested,
  ]
);

export const selectPostById = createSelector(
  [selectAllPosts, (_state, postId) => postId],
  (allPosts, postId) =>
    (allPosts || []).find((p) => (p?._id || p?.id) === postId) || null
);

/* ----------------------------- invite row helpers ----------------------------- */

const DEBUG_INVITES_ROW = true;

const dInvites = (...args) => {
  if (!DEBUG_INVITES_ROW) return;
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return;
  console.log('[invitesRow]', ...args);
};

const normalizePostType = (input) => {
  if (!input) return '';
  const raw =
    input.type ||
    input.postType ||
    input.canonicalType ||
    input.kind ||
    '';
  return String(raw).trim().toLowerCase();
};

const isInvitePost = (post) => {
  const t = normalizePostType(post || {});
  return t === 'invite';
};

const getTimeMs = (post) => {
  const d = post?.details || {};
  const raw =
    d.dateTime ||
    post.dateTime || // fallback
    post.sortDate ||
    post.createdAt;

  if (!raw) return null;

  // Date instance
  if (raw instanceof Date) {
    return raw.getTime();
  }

  // numeric epoch
  if (typeof raw === 'number') {
    return raw;
  }

  // string
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }

  return null;
};

const isFutureEnough = (post, nowMs) => {
  const t = getTimeMs(post);
  if (!t) {
    // If no valid time, allow for now so we can at least show something
    return true;
  }

  const threeHours = 3 * 60 * 60 * 1000;
  return t >= nowMs - threeHours;
};

const buildTimeBucketLabel = (post) => {
  const d = post?.details || {};
  const raw =
    d.dateTime ||
    post.dateTime ||
    post.sortDate ||
    post.createdAt;

  if (!raw) return '';

  const dt = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(dt.getTime())) return '';

  const now = new Date();

  const midnightNow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const midnightDt = new Date(
    dt.getFullYear(),
    dt.getMonth(),
    dt.getDate()
  );

  const diffDays =
    (midnightDt.getTime() - midnightNow.getTime()) /
    (1000 * 60 * 60 * 24);

  if (diffDays === 0) {
    return 'Tonight';
  }
  if (diffDays === 1) {
    return 'Tomorrow';
  }

  const day = dt.getDay(); // 0–6 (Sun–Sat)
  const isWeekend = day === 5 || day === 6 || day === 0;

  if (diffDays > 1 && diffDays <= 7 && isWeekend) {
    return 'This weekend';
  }

  const weekday = dt.toLocaleDateString(undefined, { weekday: 'short' });
  const timeShort = dt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${weekday} ${timeShort}`;
};

const getStatusForUser = (post, userId) => {
  if (!post || !userId) return null;
  const uid = String(userId);

  const d = post.details || {};
  const recipients = Array.isArray(d.recipients) ? d.recipients : [];

  for (const r of recipients) {
    if (!r) continue;

    const rid =
      r.userId ||
      r._id ||
      r.id ||
      (r.user && (r.user._id || r.user.id));

    if (!rid) continue;
    if (String(rid) !== uid) continue;

    const status = String(r.status || '').toLowerCase();

    if (!status) return 'pending';
    if (status === 'accepted') return 'accepted';
    if (status === 'declined') return 'declined';
    return status;
  }

  // If not in recipients but you're the owner, treat as "accepted"/host
  const ownerId =
    post.ownerId ||
    (post.owner && (post.owner._id || post.owner.id));

  if (ownerId && String(ownerId) === uid) {
    return 'accepted';
  }

  return null;
};

const getOwnerId = (post) => {
  return (
    post.ownerId ||
    (post.owner && (post.owner._id || post.owner.id)) ||
    null
  );
};

const getImageUrlForInvite = (post) => {
  const firstMedia = Array.isArray(post.media) ? post.media[0] : null;

  return (
    post.businessLogoUrl ||
    (firstMedia &&
      (firstMedia.url ||
        firstMedia.signedUrl ||
        firstMedia.photoUrl)) ||
    (post.owner && post.owner.profilePicUrl) ||
    null
  );
};

/* -------------------------- invites row selector -------------------------- */

// This builds the payload `WhatsHappeningStrip` expects.
export const selectMyInvitesForRow = createSelector(
  [selectUserAndFriendsPosts, selectUser],
  (posts, user) => {
    const uid = user?.id || user?._id || null;
    const safePosts = Array.isArray(posts) ? posts : [];
    const nowMs = Date.now();
    const items = [];

    for (const post of safePosts) {
      if (!post) continue;
      if (!isInvitePost(post)) continue;
      if (!isFutureEnough(post, nowMs)) continue;

      const postId = post._id || post.id;
      if (!postId) continue;

      const ownerId = getOwnerId(post);
      const isHost =
        ownerId && uid && String(ownerId) === String(uid);

      const statusForUser = uid ? getStatusForUser(post, uid) : null;

      // If user explicitly declined, skip
      if (statusForUser === 'declined') continue;

      const placeName =
        post.businessName ||
        post.message ||
        'Invite';

      const imageUrl = getImageUrlForInvite(post);
      const startTimeMs = getTimeMs(post);
      const timeLabel = buildTimeBucketLabel(post);
      const placeId = post.placeId || null;

      let type;
      let badge;

      if (isHost || statusForUser === 'accepted') {
        type = 'you';
        badge = 'YOU';
      } else if (statusForUser === 'pending') {
        type = 'invite';
        badge = 'INVITE';
      } else {
        // viewer isn't host and isn't in recipients → friends' invite
        type = 'friends';
        badge = 'FRIENDS';
      }

      items.push({
        id: String(postId),
        postId: String(postId),
        type,                // 'you' | 'invite' | 'friends'
        timeLabel,           // 'Tonight' | 'Tomorrow' | 'This weekend' | 'Wed 7:00 PM'
        mainLabel: placeName,
        imageUrl,
        badge,               // 'YOU' | 'INVITE' | 'FRIENDS'
        statusForUser: statusForUser || null,
        isHost: !!isHost,
        ownerId: ownerId ? String(ownerId) : null,
        placeId,
        startTimeMs: startTimeMs || null,
      });
    }

    // Soonest first
    items.sort((a, b) => {
      const at = a.startTimeMs || 0;
      const bt = b.startTimeMs || 0;
      return at - bt;
    });

    return items;
  }
);