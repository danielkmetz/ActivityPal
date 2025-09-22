import { Animated } from 'react-native';
import store from '../store';
import { toggleLike as togglePostLike } from '../Slices/LikesSlice';
import { medium, selection } from '../utils/Haptics/haptics';
import {
  createNotification,
  deleteNotification,
  selectNotificationByFields,
} from '../Slices/NotificationsSlice';
import { fireHapticOnce } from './Haptics/fireHapticOnce';

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

  try {
    const result = await dispatch(togglePostLike({ postType: normalizedType, postId }));
    const payload = result?.payload;
    const data = payload?.data || {};
    const userLiked = typeof data.liked === 'boolean'
      ? data.liked
      : Array.isArray(data.likes)
        ? data.likes.some(l => String(l.userId) === String(userId))
        : false;

    const ownerId = getOwnerId(normalizedType, review);

    if (!ownerId || String(ownerId) === String(userId)) {
      return;
    }

    const typeRef = typeRefFor(normalizedType);

    if (userLiked) {
      const msg = `${fullName} ${likeMessageFor(normalizedType)}`;
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
      if (existing?._id) {
        await dispatch(deleteNotification({ userId: ownerId, notificationId: existing._id }));
      }
    }
  } catch (e) {
    err(`handleLike: Error toggling like for ${postType} (${postId})`, e);
  }
};

/* ---------------------------------- */
/* Public API with double-tap logic   */
/* ---------------------------------- */
const getLikedState = (entity, userId) => {
  if (!entity) return false;
  if (Array.isArray(entity.likes)) {
    return entity.likes.some(l => String(l.userId) === String(userId));
  }
  return !!entity.liked || !!entity.likedByMe;
};

export const handleLikeWithAnimation = async ({
  postType,
  postId,          // may be undefined for suggestions; we’ll resolve below
  review,          // the entity being liked (share doc, review, suggestion, etc.)
  user,
  dispatch,
  animation,       // Animated.Value registered for the *animation target* (usually from PhotoItem/Feed)
  lastTapRef,
  force = false,   // pass true from your double-tap handler
  animateTarget = null,
}) => {
  const normalizedType = normalizePostType(postType, review);

  // 1) Compute the effective LIKE id (suggestions may map to their underlying post)
  const effectivePostId = postType === 'suggestion'
    ? resolveSuggestionPostId(review, postId)
    : (postId || pickId(review));

  if (!effectivePostId) {
    warn('handleLikeWithAnimation: missing effectivePostId', { postType, reviewId: pickId(review) });
    return;
  }

  // 2) Decide where to ANIMATE: default to the liked entity, or use the provided animateTarget
  const animEntity = animateTarget || review;
  const animKey = pickId(animEntity) || effectivePostId;     // the key your PhotoItem registered with
  const hasAnim = animation instanceof Animated.Value;

  // 3) Compute pre-toggle liked state on the LIKE (logical) entity
  const wasLikedBefore = getLikedState(review, user?.id);

  // 4) Double-tap gate – only key off the ANIMATION TARGET
  lastTapRef.current ||= {};
  const now = Date.now();
  const last = lastTapRef.current[animKey] || 0;
  const shouldAnimate = force || (now - last < 300);

  if (!shouldAnimate) {
    lastTapRef.current[animKey] = now; // arm
    return;
  }

  // 5) Perform the LIKE toggle on the logical target
  await handleLike({
    postType: normalizedType,
    postId: effectivePostId,
    review,
    userId: user?.id,
    fullName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
    dispatch,
  });

  try {
    const nextLiked = !wasLikedBefore; // optimistic: we just toggled it
    fireHapticOnce(animKey, () => (nextLiked ? medium() : selection()));
  } catch { }

  // 6) Run overlay only on unliked → liked transition
  if (!wasLikedBefore && hasAnim) {
    Animated.timing(animation, { toValue: 1, duration: 50, useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(animation, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
          log('handleLikeWithAnimation: overlay end', { animKey });
        });
      }, 500);
    });
  } else {
    log('handleLikeWithAnimation: skip overlay (already liked or no anim)', {
      wasLikedBefore, hasAnim, animKey,
    });
  }

  // 7) Update the tap time for the animation key
  lastTapRef.current[animKey] = now;
};