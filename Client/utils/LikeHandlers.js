// helpers/likes.js
import { Animated } from 'react-native';
import { toggleLike as togglePostLike } from '../Slices/LikesSlice';
import { medium, selection } from '../utils/Haptics/haptics';
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
  return (
    entity?._id ||
    entity?.id ||
    entity?.linkedPostId ||
    entity?.eventId ||
    entity?.promotionId ||
    entity?.postId ||
    fallback
  );
};

/**
 * Map any UI/legacy type to the new router keys.
 * - All "post-like" things => 'posts' (review, check-in, invite, sharedPost, liveStream)
 * - Events/Promotions stay explicit
 * - Suggestions decide between events/promotions by entity.kind/__typename
 */
const normalizePostType = (t, entity) => {
  if (t === 'suggestion') {
    const kind = String(entity?.kind || entity?.__typename || '').toLowerCase();
    if (kind.includes('promo')) return 'promotions';
    if (kind.includes('event')) return 'events';
    // default to events for suggestions if ambiguous
    return 'events';
  }

  const lower = String(t || '').toLowerCase();

  // Explicit fast paths
  if (lower === 'events' || lower === 'event') return 'events';
  if (lower === 'promotions' || lower === 'promotion') return 'promotions';

  // Null/empty t: infer from entity
  if (!lower) {
    const tn = String(entity?.__typename || '').toLowerCase();
    const kind = String(entity?.kind || '').toLowerCase();
    if (tn === 'event' || kind.includes('event')) return 'events';
    if (tn === 'promotion' || kind.includes('promo')) return 'promotions';
    // everything else is a unified Post
    return 'posts';
  }

  // Anything "post-like" → unified Post route
  switch (lower) {
    case 'review':
    case 'reviews':
    case 'checkin':
    case 'check-ins':
    case 'check-in':
    case 'checkins':
    case 'invite':
    case 'invites':
    case 'sharedpost':
    case 'sharedposts':
    case 'livestream':
    case 'live-stream':
    case 'livestreams':
    case 'live-streams':
    case 'post':
    case 'posts':
      return 'posts';
    default:
      // Fall back: if caller passed something odd, prefer 'posts'
      return 'posts';
  }
};

/* ---------------------------------- */
/* Core like handler (centralized)     */
/* ---------------------------------- */
export const handleLike = async ({
  postType,
  postId,
  review,   // entity being liked (post/review/invite/event/promo/suggestion)
  userId,
  dispatch,
}) => {
  if (!postId) {
    warn('handleLike: missing postId', { postType, reviewId: pickId(review) });
    return null;
  }

  const normalizedType = normalizePostType(postType, review);

  try {
    // Thunk returns: { postId, likes, likesCount, liked }
    const result = await dispatch(togglePostLike({ postType: normalizedType, postId }));
    const payload = result?.payload || {};

    // Derive whether *this user* now likes it
    const userLiked =
      typeof payload.liked === 'boolean'
        ? payload.liked
        : Array.isArray(payload.likes)
          ? payload.likes.some((l) => String(l.userId) === String(userId))
          : false;

    log('handleLike: toggled', {
      type: normalizedType,
      postId,
      liked: userLiked,
      likesCount: payload.likesCount,
    });

    // Server handles notifications now; nothing to do client-side.
    return payload;
  } catch (e) {
    err(`handleLike: Error toggling like for ${postType} (${postId})`, e);
    return null;
  }
};

/* ---------------------------------- */
/* Public API with double-tap logic    */
/* ---------------------------------- */
const getLikedState = (entity, uid) => {
  if (!entity) return false;
  if (Array.isArray(entity.likes)) {
    return entity.likes.some((l) => String(l.userId) === String(uid));
  }
  return !!entity.liked || !!entity.likedByMe;
};

export const handleLikeWithAnimation = async ({
  postType,
  postId,            // may be undefined for suggestions; we’ll resolve below
  review,            // the entity being liked (share doc, review, suggestion, etc.)
  user,
  dispatch,
  animation,         // Animated.Value registered for the overlay (e.g., heart)
  lastTapRef,
  force = false,     // pass true from your double-tap handler
  animateTarget = null,
}) => {
  const normalizedType = normalizePostType(postType, review);

  // 1) Compute the effective LIKE id (suggestions may map to their underlying item)
  const effectivePostId =
    postType === 'suggestion'
      ? resolveSuggestionPostId(review, postId)
      : (postId || pickId(review));

  if (!effectivePostId) {
    warn('handleLikeWithAnimation: missing effectivePostId', { postType, reviewId: pickId(review) });
    return;
  }

  // 2) Decide where to animate
  const animEntity = animateTarget || review;
  const animKey = pickId(animEntity) || effectivePostId;
  const hasAnim = animation instanceof Animated.Value;

  // 3) Compute pre-toggle state
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

  // 5) Perform the LIKE toggle
  await handleLike({
    postType: normalizedType,
    postId: effectivePostId,
    review,
    userId: user?.id,
    dispatch,
  });

  // 6) Haptics (optimistic)
  const nextLiked = !wasLikedBefore;
  try {
    fireHapticOnce(animKey, () => (nextLiked ? medium() : selection()));
  } catch {}

  // 7) Run overlay only on unliked → liked
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

  // 8) Update tap time for the animation key
  lastTapRef.current[animKey] = now;
};
