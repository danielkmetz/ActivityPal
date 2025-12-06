import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import {
  acceptInvite,
  rejectInvite,
  requestInvite,
  acceptInviteRequest,
  rejectInviteRequest,
  sendInvite,
  editInvite,
} from '../../Slices/PostsSlice';
import {
  createNotification,
  setNotifications,
  selectNotifications,
} from '../../Slices/NotificationsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { runConflictCheckBeforeAccept } from './runConflictCheck';

const toId = (v) => (v && v.toString ? v.toString() : v || '');

export default function useInviteActions(invite) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const notifications = useSelector(selectNotifications) || [];
  const meId = toId(user?.id || user?._id);
  const postContent = invite?.original ?? invite ?? {};
  const inviteId = postContent?._id || invite?._id;
  const owner = postContent?.owner;
  const senderId = owner?.id || owner?._id || owner?.userId || null;
  const businessName =
    postContent.businessName ||
    postContent.business?.businessName ||
    'this event';

  /** -------- shared conflict-check wrapper for this invite/user -------- */
  const checkForConflictsBeforeAccept = useCallback(
    () =>
      runConflictCheckBeforeAccept({
        dispatch,
        userId: meId,
        inviteId,
      }),
    [dispatch, meId, inviteId]
  );

  /** -------------------- 1) Accept / decline for current user -------------------- */
  const acceptForMe = useCallback(async () => {
    if (!inviteId || !meId) return;

    const ok = await checkForConflictsBeforeAccept();
    if (!ok) return;

    try {
      await dispatch(
        acceptInvite({ recipientId: meId, inviteId })
      ).unwrap();
    } catch (e) {
      console.warn('Failed to accept invite:', e?.message || e);
      Alert.alert('Error', 'Could not accept invite.');
    }
  }, [dispatch, inviteId, meId, checkForConflictsBeforeAccept]);

  const declineForMe = useCallback(async () => {
    if (!inviteId || !meId) return;
    try {
      await dispatch(
        rejectInvite({ recipientId: meId, inviteId })
      ).unwrap();
    } catch (e) {
      console.warn('Failed to decline invite:', e?.message || e);
      Alert.alert('Error', 'Could not decline invite.');
    }
  }, [dispatch, inviteId, meId]);

  /** --------------------------- 2) Request to join --------------------------- */
  const requestToJoin = useCallback(async () => {
    if (!inviteId || !meId) return false;
    try {
      await dispatch(
        requestInvite({ userId: meId, inviteId })
      ).unwrap();

      if (senderId) {
        await dispatch(
          createNotification({
            userId: senderId,
            type: 'requestInvite',
            message: `${
              user?.firstName || 'Someone'
            } wants to join your event at ${businessName}`,
            relatedId: meId,
            typeRef: 'User',
            targetId: inviteId,
            targetRef: 'Post',
            postType: 'invite',
          })
        ).unwrap();
      }

      Alert.alert('Request sent', 'Your request has been sent!');
      return true;
    } catch (err) {
      console.error('❌ Failed to request invite or send notification:', err);
      Alert.alert('Error', err?.message || 'Something went wrong.');
      return false;
    }
  }, [dispatch, inviteId, meId, senderId, businessName, user?.firstName]);

  /** ----------------- 3) Host: accept / reject join requests ----------------- */
  const acceptJoinRequest = useCallback(
    async (relatedId) => {
      if (!inviteId || !relatedId) return;
      try {
        await dispatch(
          acceptInviteRequest({ userId: relatedId, inviteId })
        ).unwrap();

        await dispatch(
          createNotification({
            userId: relatedId,
            type: 'activityInviteAccepted',
            message: `${user.firstName} ${user.lastName} accepted your request to join the event.`,
            relatedId: meId,
            typeRef: 'User',
            targetId: inviteId,
            targetRef: 'Post',
            postType: 'invite',
          })
        ).unwrap();

        const filtered = notifications.filter(
          (n) =>
            !(
              n.type === 'requestInvite' &&
              n.relatedId === relatedId &&
              n.targetId === inviteId
            )
        );
        dispatch(setNotifications(filtered));
      } catch (err) {
        console.error('❌ Error accepting join request:', err);
      }
    },
    [
      dispatch,
      inviteId,
      meId,
      notifications,
      user?.firstName,
      user?.lastName,
    ]
  );

  const rejectJoinRequest = useCallback(
    async (relatedId) => {
      if (!inviteId || !relatedId) return;
      try {
        await dispatch(
          rejectInviteRequest({ userId: relatedId, inviteId })
        ).unwrap();

        await dispatch(
          createNotification({
            userId: relatedId,
            type: 'activityInviteDeclined',
            message: `${user.firstName} ${user.lastName} declined your request to join the event.`,
            relatedId: meId,
            typeRef: 'User',
            targetId: inviteId,
            targetRef: 'Post',
          })
        ).unwrap();

        const filtered = notifications.filter(
          (n) =>
            !(
              n.type === 'requestInvite' &&
              n.relatedId === relatedId &&
              n.targetId === inviteId
            )
        );
        dispatch(setNotifications(filtered));
      } catch (err) {
        console.error('❌ Error rejecting join request:', err);
      }
    },
    [
      dispatch,
      inviteId,
      meId,
      notifications,
      user?.firstName,
      user?.lastName,
    ]
  );

  /** --------- 4) Create / edit helpers that ALSO use the conflict checker --------- */

  // For create flow: no inviteId yet → use dateTime only.
  const sendInviteWithConflicts = useCallback(
    async ({
      recipientIds,
      placeId,
      businessName: nameFromForm,
      dateTime,
      note,
      isPublic,
    }) => {
      if (!meId) return { cancelled: true };

      const ok = await runConflictCheckBeforeAccept({
        dispatch,
        userId: meId,
        dateTime,
      });

      if (!ok) return { cancelled: true };

      const result = await dispatch(
        sendInvite({
          senderId: meId,
          recipientIds,
          placeId,
          businessName: nameFromForm,
          dateTime,
          note,
          isPublic,
        })
      ).unwrap();

      return { cancelled: false, result };
    },
    [dispatch, meId]
  );

  // For edit flow: we *do* have an inviteId
  const editInviteWithConflicts = useCallback(
    async ({
      inviteIdOverride,
      updates, // { placeId, businessName, dateTime, note, isPublic }
      recipientIds,
    }) => {
      const targetInviteId = inviteIdOverride || inviteId;
      if (!meId || !targetInviteId) return { cancelled: true };

      const ok = await runConflictCheckBeforeAccept({
        dispatch,
        userId: meId,
        inviteId: targetInviteId,
        dateTime: updates.dateTime,
      });

      if (!ok) return { cancelled: true };

      const result = await dispatch(
        editInvite({
          recipientId: meId,
          inviteId: targetInviteId,
          updates,
          recipientIds,
        })
      ).unwrap();

      return { cancelled: false, result };
    },
    [dispatch, meId, inviteId]
  );

  return {
    // existing flows
    acceptForMe,
    declineForMe,
    requestToJoin,
    acceptJoinRequest,
    rejectJoinRequest,

    // new centralized helpers
    sendInviteWithConflicts,
    editInviteWithConflicts,
  };
}
