import { Animated } from 'react-native';
import { toggleLike } from '../Slices/ReviewsSlice';
import { toggleLikeOnSharedPost } from '../Slices/SharedPostsSlice';
import {
  createNotification,
  deleteNotification,
  selectNotificationByFields,
} from '../Slices/NotificationsSlice';
import store from '../store';

export const handleLike = async ({
  postType,
  postId,
  review,
  userId,
  fullName,
  dispatch,
}) => {
  if (!review) {
    console.warn(`handleLike: No review provided for postId ${postId}`);
    return;
  }

  let ownerId = null;
  let placeId = review?.placeId || null;

  if (postType === 'invite') {
    ownerId = review?.sender?.id || review?.senderId;
  } else if (postType === 'sharedPost') {
    ownerId = review?.originalOwner?.id || review?.originalOwner;
  } else {
    ownerId = review?.userId;
  }

  try {
    let payload;

    console.log(postId)
    if (postType === 'sharedPost') {
      const result = await dispatch(toggleLikeOnSharedPost({ postId, userId, fullName }));
      payload = result?.payload;
    } else {
      const result = await dispatch(toggleLike({ postType, postId, placeId, userId, fullName }));
      payload = result?.payload;
    }

    const userLiked = payload?.likes?.some(like => like.userId === userId);

    if (!ownerId || ownerId === userId) return;

    const typeRef =
      postType === 'review'
        ? 'Review'
        : postType === 'check-in'
          ? 'CheckIn'
          : postType === 'invite'
            ? 'ActivityInvite'
            : 'SharedPost';

    if (userLiked) {
      // ✅ Send like notification
      await dispatch(createNotification({
        userId: ownerId,
        type: 'like',
        message: `${fullName} liked your ${postType === 'sharedPost' ? 'shared post' : postType}.`,
        relatedId: userId,
        typeRef,
        targetId: postId,
        postType,
      }));
    } else {
      // ❌ Remove like notification if unliked
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

  const wasLikedBefore = review?.likes?.some(like => like.userId === user?.id);
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
    fullName: `${user?.firstName} ${user?.lastName}`,
    dispatch,
  });

  if (!wasLikedBefore && animation instanceof Animated.Value) {
    runLikeAnimation(animation);
  }

  lastTapRef.current[postId] = now;
};
