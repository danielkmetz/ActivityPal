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
    const id = typeof userId === 'string' ? userId : String(userId?._id ?? userId ?? '');
    if (!id) throw new Error('Missing target user id');

    if (isPrivate) {
      // throws on reject
      await dispatch(sendFollowRequest(id)).unwrap();
      setIsRequestSent?.(true);

      await dispatch(createNotification({
        userId: id,
        type: 'followRequest',
        message: `${mainUser.firstName} ${mainUser.lastName} wants to follow you.`,
        relatedId: mainUser.id,
        typeRef: 'User',
      }));
    } else {
      await dispatch(followUserImmediately({ targetUserId: id })).unwrap();
      setIsFollowing?.(true);

      await dispatch(createNotification({
        userId: id,
        type: 'follow',
        message: `${mainUser.firstName} ${mainUser.lastName} started following you.`,
        relatedId: mainUser.id,
        typeRef: 'User',
      }));
    }
  } catch (err) {
    console.error('❌ Failed to follow user:', err);
    // optional: toast/snackbar here; do NOT set state or notify
  }
};
