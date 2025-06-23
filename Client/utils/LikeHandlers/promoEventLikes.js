import { Animated } from 'react-native';
import { createNotification } from '../../Slices/NotificationsSlice';
import { toggleEventLike } from '../../Slices/EventsSlice';
import { togglePromoLike } from '../../Slices/PromotionsSlice';

// Utility: Trigger like animation
const runLikeAnimation = (animation) => {
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
};

// Handles like logic + notification
export const handleEventOrPromoLike = async ({
  type, // 'event' or 'promo'
  postId,
  item,
  userId,
  fullName,
  dispatch,
}) => {
  if (!item) {
    console.warn(`handleEventOrPromoLike: No item provided for postId ${postId}`);
    return;
  }

  const placeId = item.placeId;
  const ownerId = item.userId;

  try {
    const toggleThunk = type === 'event' ? toggleEventLike : togglePromoLike;
    const { payload } = await dispatch(toggleThunk({ postId, placeId, userId, fullName }));

    const userLiked = payload?.likes?.some(like => like.userId === userId);

    if (userLiked && ownerId && ownerId !== userId) {
      await dispatch(createNotification({
        userId: ownerId,
        type: 'like',
        message: `${fullName} liked your ${type}.`,
        relatedId: userId,
        typeRef: type === 'event' ? 'Event' : 'Promotion',
        targetId: postId,
        postType: type,
      }));
    }
  } catch (err) {
    console.error(`Error toggling like for ${type} (${postId}):`, err);
  }
};

// Handles double-tap + animation
export const eventPromoLikeWithAnimation = async ({
  type,
  postId,
  item,
  user,
  lastTapRef,
  likedAnimations,
  setLikedAnimations,
  dispatch,
  force = false,
}) => {
  const now = Date.now();
  lastTapRef.current ||= {};
  lastTapRef.current[postId] ||= 0;

  const wasLikedBefore = item?.likes?.some(like => like.userId === user?.id);
  const shouldAnimate = force || (now - lastTapRef.current[postId] < 300);

  if (!shouldAnimate) {
    lastTapRef.current[postId] = now;
    return;
  }

  await handleEventOrPromoLike({
    type,
    postId,
    item,
    userId: user?.id,
    fullName: `${user?.firstName} ${user?.lastName}`,
    dispatch,
  });

  if (!wasLikedBefore) {
    let animation = likedAnimations[postId];

    if (!(animation instanceof Animated.Value)) {
      animation = new Animated.Value(0);
      setLikedAnimations(prev => ({
        ...prev,
        [postId]: animation,
      }));
    }

    runLikeAnimation(animation);
  }

  lastTapRef.current[postId] = now;
};
