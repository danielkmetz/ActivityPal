import { sendFollowRequest, followUserImmediately } from '../Slices/friendsSlice';
import { createNotification } from '../Slices/NotificationsSlice';

export const handleFollowUserHelper = async ({
  isPrivate,
  userId,
  mainUser,
  dispatch,
  setIsFollowing,
  setIsRequestSent,
}) => {
  try {
    if (isPrivate) {
      await dispatch(sendFollowRequest({ targetUserId: userId }));
      setIsRequestSent?.(true);

      await dispatch(createNotification({
        userId,
        type: 'followRequest',
        message: `${mainUser.firstName} ${mainUser.lastName} wants to follow you.`,
        relatedId: mainUser.id,
        typeRef: 'User',
      }));
    } else {
      await dispatch(followUserImmediately({ targetUserId: userId }));
      setIsFollowing?.(true);

      await dispatch(createNotification({
        userId,
        type: 'follow',
        message: `${mainUser.firstName} ${mainUser.lastName} started following you.`,
        relatedId: mainUser.id,
        typeRef: 'User',
      }));
    }
  } catch (err) {
    console.error("❌ Failed to follow user:", err);
  }
};
