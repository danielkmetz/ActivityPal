import { Animated } from 'react-native';
import { toggleEventLike } from '../../Slices/EventsSlice';
import { togglePromoLike } from '../../Slices/PromotionsSlice';
import { createBusinessNotification } from '../../Slices/BusNotificationsSlice';

// Utility: Trigger like animation
const runLikeAnimation = (animation) => {
  if (!(animation instanceof Animated.Value)) return;

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
  type,
  postId,
  item,
  userId,
  fullName,
  dispatch,
}) => {
  if (!item) return;

  const placeId = item.placeId;
  const ownerId = item.ownerId?.toString();

  try {
    const toggleThunk = type === 'event' ? toggleEventLike : togglePromoLike;
    const actionResult = await dispatch(toggleThunk({ id: postId, placeId, userId, fullName }));

    const payload = actionResult?.payload;
    const userLiked = payload?.likes?.some(like => like.userId === userId);
    const isOwner = userId === ownerId;

    if (userLiked && ownerId && !isOwner) {
      await dispatch(createBusinessNotification({
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
    console.error(`Failed to like ${type}:`, err);
  }
};

// Handles double-tap + animation
export const eventPromoLikeWithAnimation = async ({
  type,
  postId,
  item,
  user,
  lastTapRef,
  animation,
  dispatch,
  force = false,
}) => {
  const now = Date.now();
  lastTapRef.current ||= {};
  lastTapRef.current[postId] ||= 0;

  const timeSinceLastTap = now - lastTapRef.current[postId];
  const wasLikedBefore = item?.likes?.some(like => like.userId === user?.id);
  const shouldAnimate = force || timeSinceLastTap < 300;

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

  if (!wasLikedBefore && animation instanceof Animated.Value) {
    runLikeAnimation(animation);
  }

  lastTapRef.current[postId] = now;
};
