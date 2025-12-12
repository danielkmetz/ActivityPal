import { Animated } from 'react-native';
import { toggleLike as togglePostLike } from '../Slices/LikesSlice';
import { medium, selection } from '../utils/Haptics/haptics';
import { fireHapticOnce } from './Haptics/fireHapticOnce';
import { normalizePostType } from './normalizePostType';

/* ---------------------------------- */
/* Debug helpers                       */
/* ---------------------------------- */
const DEBUG_LIKES = true;
const ts = () => new Date().toISOString().split('T')[1].replace('Z', '');
const log = (...a) => DEBUG_LIKES && console.log(`[likes ${ts()}]`, ...a);
const warn = (...a) => DEBUG_LIKES && console.warn(`[likes ${ts()}]`, ...a);
const err = (...a) => DEBUG_LIKES && console.error(`[likes ${ts()}]`, ...a);
const pickId = (e) => e?._id || e?.id || e?.linkedPostId || e?.eventId || e?.promotionId || e?.postId || null;

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

const normalizeLikeBucket = (postType, entity) => {
  // If caller already passed a bucket, keep it.
  const lower = String(postType || '').toLowerCase();
  if (lower === 'posts' || lower === 'events' || lower === 'promotions') return lower;

  // Canonicalize from postType + entity context
  const canonical =
    normalizePostType(
      lower === 'suggestion'
        ? { type: 'suggestion', kind: entity?.kind || entity?.__typename }
        : postType
    ) ||
    normalizePostType(entity);

  if (canonical === 'event') return 'events';
  if (canonical === 'promotion') return 'promotions';
  if (canonical === 'suggestion') return 'events';

  return 'posts';
};

/* ---------------------------------- */
/* Core like handler (centralized)     */
/* ---------------------------------- */
export const handleLike = async ({
  postType, // now expects: 'posts' | 'events' | 'promotions'
  postId,
  review,
  userId,
  dispatch,
}) => {
  if (!postId) return null;

  try {
    const result = await dispatch(togglePostLike({ postType, postId }));
    const payload = result?.payload || {};

    const userLiked =
      typeof payload.liked === 'boolean'
        ? payload.liked
        : Array.isArray(payload.likes)
          ? payload.likes.some((l) => String(l.userId) === String(userId))
          : false;

    return payload;
  } catch (e) {
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
  const normalizedType = normalizeLikeBucket(postType, review);

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
