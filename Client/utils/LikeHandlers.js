import { Animated } from 'react-native';
import { toggleLike } from '../Slices/ReviewsSlice';
import { toggleLikeOnSharedPost } from '../Slices/SharedPostsSlice';
import { toggleLiveLike } from '../Slices/LiveStreamSlice'; // 👈 NEW
import {
  createNotification,
  deleteNotification,
  selectNotificationByFields,
} from '../Slices/NotificationsSlice';
import store from '../store';

/* ---------------------------------- */
/* Helpers                            */
/* ---------------------------------- */
const typeRefFor = (postType) => {
  switch (postType) {
    case 'review': return 'Review';
    case 'check-in': return 'CheckIn';
    case 'invite': return 'ActivityInvite';
    case 'sharedPost': return 'SharedPost';
    case 'liveStream': return 'LiveStream'; // 👈 NEW
    default: return 'SharedPost';
  }
};

const likeMessageFor = (postType) => {
  switch (postType) {
    case 'liveStream': return 'liked your live stream.'; // 👈 NEW
    case 'sharedPost': return 'liked your shared post.';
    case 'check-in': return 'liked your check-in.';
    case 'invite': return 'liked your invite.';
    default: return `liked your ${postType}.`;
  }
};

/* ---------------------------------- */
/* Core like handler                  */
/* ---------------------------------- */
export const handleLike = async ({
  postType,
  postId,
  review,
  userId,
  fullName,
  dispatch,
}) => {
  if (!review) {
    console.warn(`handleLike: No review/live doc provided for postId ${postId}`);
    return;
  }

  // ownerId is the content owner's user id
  let ownerId = null;
  let placeId = review?.placeId || null;

  if (postType === 'invite') {
    ownerId = review?.sender?.id || review?.senderId;
  } else if (postType === 'sharedPost') {
    ownerId = review?.originalOwner?.id || review?.originalOwner;
  } else if (postType === 'liveStream') {
    ownerId = review?.userId;                     // 👈 server sets host user id here
  } else {
    ownerId = review?.userId;
  }

  try {
    let payload;

    if (postType === 'sharedPost') {
      const result = await dispatch(toggleLikeOnSharedPost({ postId, userId, fullName }));
      payload = result?.payload;
    } else if (postType === 'liveStream') {
      const result = await dispatch(toggleLiveLike({ liveId: postId })); // 👈 NEW
      payload = result?.payload; // expected: { liveId, liked, likes, likesCount }
      // Normalize to match downstream check
      if (payload && !payload.likes && Array.isArray(review?.likes)) {
        // if API returns only counts, fallback to local review.likes
        payload.likes = review.likes;
      }
    } else {
      const result = await dispatch(toggleLike({ postType, postId, placeId, userId, fullName }));
      payload = result?.payload;
    }

    const userLiked = Array.isArray(payload?.likes)
      ? payload.likes.some(like => String(like.userId) === String(userId))
      : !!payload?.liked; // live stream thunk returns { liked }

    // No notification if liking your own content
    if (!ownerId || String(ownerId) === String(userId)) return;

    const typeRef = typeRefFor(postType);

    if (userLiked) {
      await dispatch(createNotification({
        userId: ownerId,
        type: 'like',
        message: `${fullName} ${likeMessageFor(postType)}`,
        relatedId: userId,
        typeRef,
        targetId: postId,     // liveId for live streams
        postType,
      }));
    } else {
      // Remove like notification on unlike
      const state = store.getState();
      const existingNotification = selectNotificationByFields(state, {
        relatedId: userId,
        targetId: postId,
        typeRef,
      });

      if (existingNotification?._id) {
        await dispatch(deleteNotification({ userId: ownerId, notificationId: existingNotification._id }));
      }
    }
  } catch (error) {
    console.error(`Error toggling like for ${postType} (${postId}):`, error);
  }
};

/* ---------------------------------- */
/* Animation helper (unchanged)       */
/* ---------------------------------- */
const runLikeAnimation = (animation) => {
  if (!(animation instanceof Animated.Value)) {
    console.warn('⚠️ Invalid or missing Animated.Value passed to runLikeAnimation');
    return;
  }
  Animated.timing(animation, {
    toValue: 1,
    duration: 50,
    useNativeDriver: true,
  }).start(() => {
    setTimeout(() => {
      Animated.timing(animation, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => console.log('✅ Animation back to 0 complete'));
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
  const now = Date.now();

  lastTapRef.current ||= {};
  lastTapRef.current[postId] ||= 0;

  const wasLikedBefore = Array.isArray(review?.likes)
    ? review.likes.some(like => String(like.userId) === String(user?.id))
    : !!review?.likedByMe; // live entities may store a boolean

  const shouldAnimate = force || (now - lastTapRef.current[postId] < 300);

  if (!shouldAnimate) {
    lastTapRef.current[postId] = now;
    return;
  }

  await handleLike({
    postType,
    postId,
    review,
    userId: user?.id,
    fullName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
    dispatch,
  });

  if (!wasLikedBefore && animation instanceof Animated.Value) {
    runLikeAnimation(animation);
  }

  lastTapRef.current[postId] = now;
};
