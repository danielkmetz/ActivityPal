import { Animated } from 'react-native';
import { toggleLike } from '../Slices/ReviewsSlice';
import { createNotification } from '../Slices/NotificationsSlice';

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
  }

  const placeId = review?.placeId || null;

  let ownerId = null;
  if (postType === 'invite') {
    ownerId = review?.sender?.id || review?.senderId;
  } else {
    ownerId = review?.userId;
  }

  try {
    const { payload } = await dispatch(toggleLike({ postType, postId, placeId, userId, fullName }));

    const userLiked = payload?.likes?.some(like => like.userId === userId);

    if (userLiked && ownerId && ownerId !== userId) {
      await dispatch(createNotification({
        userId: ownerId,
        type: 'like',
        message: `${fullName} liked your ${postType}.`,
        relatedId: userId,
        typeRef:
          postType === 'review'
            ? 'Review'
            : postType === 'check-in'
              ? 'CheckIn'
              : 'ActivityInvite',
        targetId: postId,
        postType,
      }));
    }
  } catch (error) {
    console.error(`Error toggling like for ${postType} (${postId}):`, error);
  }
};

export const handleLikeWithAnimation = async ({
  postType,
  postId,
  review,
  user,
  dispatch,
  lastTapRef,
  likedAnimations,
  setLikedAnimations,
  force = false,
}) => {
  const now = Date.now();
  if (!lastTapRef.current) lastTapRef.current = {};
  if (!lastTapRef.current[postId]) lastTapRef.current[postId] = 0;

  const wasLikedBefore = review?.likes?.some(like => like.userId === user?.id);
  const shouldAnimate = force || (now - lastTapRef.current[postId] < 300);

  if (shouldAnimate) {
    await handleLike({
      postType,
      postId,
      review,
      userId: user?.id,
      fullName: `${user?.firstName} ${user?.lastName}`,
      dispatch,
    });

    if (!wasLikedBefore) {
      if (!likedAnimations[postId]) {
        likedAnimations[postId] = new Animated.Value(0);
        setLikedAnimations({ ...likedAnimations });
      }

      const animation = likedAnimations[postId];

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
          }).start();
        }, 500);
      });

      setLikedAnimations(prev => ({
        ...prev,
        [postId]: animation,
      }));
    }
  }

  lastTapRef.current[postId] = now;
};
