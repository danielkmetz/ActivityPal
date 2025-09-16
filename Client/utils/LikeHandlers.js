import { Animated } from 'react-native';
import store from '../store';
import { toggleLike as togglePostLike } from '../Slices/LikesSlice';

// Notifications
import {
  createNotification,
  deleteNotification,
  selectNotificationByFields,
} from '../Slices/NotificationsSlice';

/* ---------------------------------- */
/* Debug helpers                       */
/* ---------------------------------- */

const DEBUG_LIKES = true;

const ts = () => new Date().toISOString().split('T')[1].replace('Z', '');
const log = (...a) => DEBUG_LIKES && console.log(`[likes ${ts()}]`, ...a);
const warn = (...a) => DEBUG_LIKES && console.warn(`[likes ${ts()}]`, ...a);
const err = (...a) => DEBUG_LIKES && console.error(`[likes ${ts()}]`, ...a);

const pickId = (e) =>
  e?._id || e?.id || e?.linkedPostId || e?.eventId || e?.promotionId || e?.postId || null;

/* ---------------------------------- */
/* Type helpers                        */
/* ---------------------------------- */

// Resolve the underlying post id when dealing with suggestion cards
const resolveSuggestionPostId = (entity, fallback) => {
  const resolved =
    entity?._id ||
    entity?.id ||
    entity?.linkedPostId ||
    entity?.eventId ||
    entity?.promotionId ||
    entity?.postId ||
    fallback;
  log('resolveSuggestionPostId:', { resolved, fallback, entityKey: pickId(entity) });
  return resolved;
};

// Map any legacy/singular UI type → backend router key.
const normalizePostType = (t, entity) => {
  if (!t) {
    const kind = String(entity?.kind || '').toLowerCase();
    if (kind.includes('event')) return 'events';
    if (kind.includes('promo')) return 'promotions';
    // schema/type-based fallbacks
    const tn = String(entity?.__typename || '').toLowerCase();
    if (tn === 'event') return 'events';
    if (tn === 'promotion') return 'promotions';
    if (tn === 'review') return 'reviews';
    if (tn === 'checkin' || tn === 'check-in') return 'checkins';
  }
  if (t === 'suggestion') {
    const kind = String(entity?.kind || '').toLowerCase();
    return kind.includes('promo') ? 'promotions' : 'events';
  }
  switch (t) {
    case 'review': return 'reviews';
    case 'check-in':
    case 'checkin': return 'checkins';
    case 'invite': return 'invites';
    case 'promotion': return 'promotions';
    case 'event': return 'events';
    case 'sharedPost': return 'sharedPosts';
    case 'liveStream': return 'liveStreams';
    default: return t;
  }
};

// For notifications.typeRef
const typeRefFor = (t) => {
  const map = {
    reviews: 'Review',
    checkins: 'CheckIn',
    invites: 'ActivityInvite',
    sharedPosts: 'SharedPost',
    liveStreams: 'LiveStream',
    promotions: 'Promotion',
    events: 'Event',
  };
  const out = map[t] || 'SharedPost';
  log('typeRefFor:', { in: t, out });
  return out;
};

const likeMessageFor = (t) => {
  const map = {
    liveStreams: 'liked your live stream.',
    sharedPosts: 'liked your shared post.',
    checkins: 'liked your check-in.',
    invites: 'liked your invite.',
    promotions: 'liked your promotion.',
    events: 'liked your event.',
    reviews: 'liked your post.',
  };
  const out = map[t] || map.reviews;
  log('likeMessageFor:', { type: t, msg: out });
  return out;
};

// Best-effort owner resolution
const getOwnerId = (postType, entity) => {
  let owner = null;
  if (postType === 'reviews' || postType === 'checkins') {
    owner = entity?.userId || entity?.user?.id || null;
  } else if (postType === 'invites') {
    owner = entity?.senderId || entity?.sender?.id || null;
  } else if (postType === 'sharedPosts') {
    owner = entity?.originalOwner?.id || entity?.originalOwner || null;
  } else if (postType === 'liveStreams') {
    owner = entity?.hostUserId || entity?.userId || null;
  }
  log('getOwnerId:', { postType, owner });
  return owner; // business-owned returns null
};

/* ---------------------------------- */
/* Core like handler (centralized)     */
/* ---------------------------------- */
export const handleLike = async ({
  postType,
  postId,
  review,
  userId,
  fullName,
  dispatch,
}) => {
  if (!postId) {
    warn('handleLike: missing postId', { postType, reviewId: pickId(review) });
    return;
  }

  const normalizedType = normalizePostType(postType, review);
  log('handleLike: dispatch toggle', { normalizedType, postId, userId });

  try {
    const result = await dispatch(togglePostLike({ postType: normalizedType, postId }));
    const payload = result?.payload;
    const data = payload?.data || {};
    log('handleLike: dispatch result (trimmed)', {
      ok: !!payload,
      hasData: !!data,
      liked: data?.liked,
      likesCount: Array.isArray(data?.likes) ? data.likes.length : undefined,
      status: result?.meta?.requestStatus,
    });

    const userLiked = typeof data.liked === 'boolean'
      ? data.liked
      : Array.isArray(data.likes)
        ? data.likes.some(l => String(l.userId) === String(userId))
        : false;

    const ownerId = getOwnerId(normalizedType, review);
    log('handleLike: computed', { userLiked, ownerId });

    if (!ownerId || String(ownerId) === String(userId)) {
      log('handleLike: skip notification (no owner or self-like)', { ownerId, userId });
      return;
    }

    const typeRef = typeRefFor(normalizedType);

    if (userLiked) {
      const msg = `${fullName} ${likeMessageFor(normalizedType)}`;
      log('handleLike: createNotification →', { ownerId, typeRef, postId, msg });
      await dispatch(createNotification({
        userId: ownerId,
        type: 'like',
        message: msg,
        relatedId: userId,
        typeRef,
        targetId: postId,
        postType: normalizedType,
      }));
    } else {
      const state = store.getState();
      const existing = selectNotificationByFields(state, {
        relatedId: userId,
        targetId: postId,
        typeRef,
      });
      log('handleLike: unlike path; existing notif?', { hasExisting: !!existing?._id, existingId: existing?._id });
      if (existing?._id) {
        await dispatch(deleteNotification({ userId: ownerId, notificationId: existing._id }));
        log('handleLike: deleteNotification dispatched');
      }
    }
  } catch (e) {
    err(`handleLike: Error toggling like for ${postType} (${postId})`, e);
  }
};

/* ---------------------------------- */
/* Animation helper                   */
/* ---------------------------------- */
const runLikeAnimation = (animation) => {
  if (!(animation instanceof Animated.Value)) {
    warn('runLikeAnimation: invalid or missing Animated.Value', { animation });
    return;
  }
  log('runLikeAnimation: start');
  Animated.timing(animation, { toValue: 1, duration: 50, useNativeDriver: true }).start(() => {
    setTimeout(() => {
      Animated.timing(animation, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        log('runLikeAnimation: end');
      });
    }, 500);
  });
};

/* ---------------------------------- */
/* Public API with double-tap logic   */
/* ---------------------------------- */
export const handleLikeWithAnimation = async ({
  postType,
  postId,
  review,
  user,
  animation,
  lastTapRef,
  dispatch,
  force = false,
}) => {
  // Resolve normalized type + effective id (suggestions may point to underlying post)
  const normalizedType = normalizePostType(postType, review);
  const suggested = postType === 'suggestion';
  const effectivePostId = suggested ? resolveSuggestionPostId(review, postId) : postId;

  const hasAnim = animation instanceof Animated.Value;
  const wasLikedBefore = Array.isArray(review?.likes)
    ? review.likes.some((like) => String(like.userId) === String(user?.id))
    : !!review?.liked || !!review?.likedByMe;

  // ⚠️ We log both keys to catch mismatches
  const lk = String(postId || '');
  const ek = String(effectivePostId || '');

  lastTapRef.current ||= {};
  if (lk && lastTapRef.current[lk] == null) lastTapRef.current[lk] = 0;
  if (ek && lastTapRef.current[ek] == null) lastTapRef.current[ek] = 0;

  const now = Date.now();
  const lastForPostId = lk ? lastTapRef.current[lk] : undefined;
  const lastForEffective = ek ? lastTapRef.current[ek] : undefined;

  // This internal gate expects *two* quick calls; but your UI already did the double-tap.
  // Prefer passing force=true from PhotoItem’s double-tap handler.
  const shouldAnimate = force || (lk && now - (lastForPostId || 0) < 300);

  log('handleLikeWithAnimation:init', {
    input: { postType, postId },
    normalizedType,
    suggested,
    effectivePostId,
    hasAnim,
    wasLikedBefore,
    lastForPostId,
    lastForEffective,
    force,
    shouldAnimate,
  });

  // Arm-and-exit path (if you keep internal gating)
  if (!shouldAnimate) {
    if (lk) lastTapRef.current[lk] = now;
    log('handleLikeWithAnimation: armed gate, returning (call again within 300ms or pass force=true)');
    return;
  }

  // Proceed to like toggle
  await handleLike({
    postType: normalizedType,
    postId: effectivePostId,
    review,
    userId: user?.id,
    fullName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
    dispatch,
  });

  // Only show overlay when we flipped from unliked → liked
  if (!wasLikedBefore && hasAnim) {
    log('handleLikeWithAnimation: run overlay animation');
    runLikeAnimation(animation);
  } else {
    log('handleLikeWithAnimation: skip overlay animation', { wasLikedBefore, hasAnim });
  }

  // Update both keys so subsequent calls aren’t misleading
  if (lk) lastTapRef.current[lk] = now;
  if (ek) lastTapRef.current[ek] = now;
  log('handleLikeWithAnimation: complete', { lk, ek, now });
};
