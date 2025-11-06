import React, { useState, useRef } from 'react';
import { View, FlatList, TouchableWithoutFeedback, StyleSheet, Alert } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { selectIsBusiness, selectUser } from '../../Slices/UserSlice';
import {
  selectNotifications,
  markNotificationRead,
  setNotifications,
  createNotification,
  deleteNotification,
} from '../../Slices/NotificationsSlice';
import { selectBusinessNotifications, markBusinessNotificationRead, deleteBusinessNotification } from '../../Slices/BusNotificationsSlice';
import {
  approveFollowRequest,
  setFollowBack,
  declineFollowRequest,
  selectFollowers,
  selectFollowRequests,
  selectFollowing,
  followUserImmediately,
} from '../../Slices/friendsSlice';
import { fetchPostById, acceptInvite, rejectInvite, acceptInviteRequest, rejectInviteRequest } from '../../Slices/PostsSlice';
import { decrementLastSeenUnreadCount } from '../../utils/notificationsHasSeen';
import { useNavigation } from '@react-navigation/native';
import SwipeableRow from './SwipeableRow';
import NotificationTextContent from './NotificationTextContent';
import getNotificationIcon from './getNotificationIcon';

export default function Notifications() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const isBusiness = useSelector(selectIsBusiness);
  const user = useSelector(selectUser);
  const notifications = useSelector((state) =>
    isBusiness ? selectBusinessNotifications(state) : selectNotifications(state)
  );
  const followRequests = useSelector(selectFollowRequests);
  const following = useSelector(selectFollowing);
  const followers = useSelector(selectFollowers);
  const [photoTapped, setPhotoTapped] = useState(null);
  const lastTapRef = useRef({});
  const userId = user?.id;
  const placeId = user?.businessDetails?.placeId;
  const fullName = `${user?.firstName} ${user?.lastName}`;

  const normalizePostType = (t = '') => {
    const s = String(t).trim().toLowerCase();
    if (['review', 'reviews'].includes(s)) return 'review';
    if (['check-in', 'checkin', 'checkins'].includes(s)) return 'check-in';
    if (['invite', 'activityinvite', 'activity-invite'].includes(s)) return 'invite';
    if (['event', 'events'].includes(s)) return 'event';
    if (['promo', 'promotion', 'promotions'].includes(s)) return 'promotion';
    if (['sharedpost', 'sharedposts'].includes(s)) return 'sharedPost';
    return s || 'review';
  };

  // Helper: pick the right fetch thunk (all go through unified fetch now)
  const getFetchAction = ({ postType, targetId }) => {
    const pt = normalizePostType(postType);
    return fetchPostById({ postType: pt, postId: targetId });
  };

  // Helper: unify 404 detection across action or AxiosError
  const isNotFound = (resOrErr) => {
    if (!resOrErr) return false;

    const statusFromPayload = resOrErr?.payload?.status || resOrErr?.payload?.response?.status;
    const statusFromError = resOrErr?.error?.status || resOrErr?.error?.code || resOrErr?.error?.response?.status;
    const axiosStatus = resOrErr?.response?.status;
    const msg =
      resOrErr?.error?.message ||
      resOrErr?.payload?.message ||
      resOrErr?.message ||
      '';

    return (
      statusFromPayload === 404 ||
      statusFromError === 404 ||
      axiosStatus === 404 ||
      (typeof msg === 'string' && msg.includes('404'))
    );
  };

  const showMissingAlert = () => {
    Alert.alert(
      'Content Not Available',
      'This post, comment, or reply no longer exists.',
      [{ text: 'OK' }]
    );
  };

  const handleNotificationPress = async (notification) => {
    if (!notification) return;

    const { type, postType, targetId, commentId, replyId, _id: notificationId } = notification;
    const target = replyId || commentId;

    // Mark as read first
    if (!isBusiness) {
      dispatch(markNotificationRead({ userId: user.id, notificationId }));
    } else {
      dispatch(markBusinessNotificationRead({ placeId, notificationId }));
    }
    await decrementLastSeenUnreadCount();

    const legacyTypes = [
      'comment',
      'review',
      'check-in',
      'reply',
      'like',
      'tag',
      'photoTag',
      'activityInvite',
    ];
    if (!legacyTypes.includes(type)) {
      console.warn('Unhandled notification type:', type);
      return;
    }

    try {
      const action = await dispatch(
        getFetchAction({ postType: normalizePostType(postType), targetId })
      );

      if (action?.meta?.requestStatus === 'rejected') {
        if (isNotFound(action)) {
          navigation.navigate('Notifications');
          showMissingAlert();
          return;
        }
        Alert.alert('Error', 'Unable to load the content.');
        return;
      }

      const payload = action?.payload ?? null;

      if (!payload || isNotFound(action)) {
        navigation.navigate('Notifications');
        showMissingAlert();
        return;
      }

      // Navigate: keep existing routes/params for compatibility
      const pt = normalizePostType(postType);
      if (pt === 'event' || pt === 'promotion') {
        navigation.navigate('EventDetails', { activity: payload, activityId: targetId });
      } else {
        navigation.navigate('CommentScreen', {
          reviewId: targetId, // kept prop name for backwards compatibility
          targetId: target,
          lastTapRef,
          photoTapped,
        });
      }
    } catch (err) {
      if (isNotFound(err)) {
        navigation.navigate('Notifications');
        showMissingAlert();
      } else {
        console.error('Error fetching notification target:', err);
        Alert.alert('Error', 'Unable to load the content.');
      }
    }
  };

  const handleAcceptRequest = async (senderId) => {
    try {
      // Optimistic UI
      const updatedNotifications = notifications.map((n) =>
        n.type === 'followRequest' && n.relatedId === senderId
          ? {
              ...n,
              message: `You accepted ${n.message.split(' ')[0]}'s follow request.`,
              type: 'followRequestAccepted',
            }
          : n
      );
      dispatch(setNotifications(updatedNotifications));
      dispatch(setFollowBack(true));

      // Backend
      await dispatch(approveFollowRequest(senderId));
      await dispatch(
        createNotification({
          userId: senderId,
          type: 'followRequestAccepted',
          message: `${user?.firstName} ${user?.lastName} accepted your follow request.`,
          relatedId: user?.id,
          typeRef: 'User',
        })
      );
    } catch (error) {
      console.error('Error accepting friend request:', error);
    }
  };

  const handleDeclineRequest = async (senderId) => {
    try {
      await dispatch(declineFollowRequest(senderId));

      const updatedNotifications = notifications.filter(
        (n) => !(n.type === 'followRequest' && n.relatedId === senderId)
      );
      dispatch(setNotifications(updatedNotifications));
    } catch (error) {
      console.error('Error declining friend request:', error);
    }
  };

  const handleAcceptInvite = async (inviteId) => {
    try {
      const { payload: updatedInvite } = await dispatch(
        acceptInvite({ recipientId: user.id, inviteId })
      );

      if (!updatedInvite) {
        console.warn('No invite returned from acceptInvite');
      }

      const updated = notifications.map((n) =>
        n.targetId === inviteId && n.type === 'activityInvite'
          ? { ...n, type: 'activityInviteAccepted', message: 'You accepted the invite!' }
          : n
      );
      dispatch(setNotifications(updated));
    } catch (error) {
      console.error('Error accepting activity invite:', error);
    }
  };

  const handleRejectInvite = async (inviteId) => {
    try {
      const { payload: updatedInvite } = await dispatch(
        rejectInvite({ recipientId: user.id, inviteId })
      );

      if (!updatedInvite) {
        console.warn('No invite returned from rejectInvite');
      }

      const updated = notifications.map((n) =>
        n.targetId === inviteId && n.type === 'activityInvite'
          ? { ...n, type: 'activityInviteDeclined', message: 'You declined the invite.' }
          : n
      );
      dispatch(setNotifications(updated));
    } catch (error) {
      console.error('Error rejecting activity invite:', error);
    }
  };

  const handleAcceptJoinRequest = async (relatedId, targetId) => {
    try {
      const { payload: updatedInvite } = await dispatch(
        acceptInviteRequest({ userId: relatedId, inviteId: targetId })
      );

      if (!updatedInvite) {
        console.warn('⚠️ No valid invite returned from backend');
        throw new Error('Backend did not return a valid invite');
      }

      // Notify the requester
      await dispatch(
        createNotification({
          userId: relatedId,
          type: 'activityInviteAccepted',
          message: `${user?.firstName} ${user?.lastName} accepted your request to join the event.`,
          relatedId: user?.id,
          typeRef: 'ActivityInvite',
          targetId,
          targetRef: 'ActivityInvite',
          postType: 'invite',
        })
      );

      // Remove the "requestInvite" notification
      const filtered = notifications.filter(
        (n) => !(n.type === 'requestInvite' && n.relatedId === relatedId && n.targetId === targetId)
      );
      dispatch(setNotifications(filtered));
    } catch (error) {
      console.error('❌ Error accepting join request:', error);
    }
  };

  const handleRejectJoinRequest = async (relatedId, targetId) => {
    try {
      await dispatch(rejectInviteRequest({ userId: relatedId, inviteId: targetId }));

      await dispatch(
        createNotification({
          userId: relatedId,
          type: 'activityInviteDeclined',
          message: `${user?.firstName} ${user?.lastName} declined your request to join the event.`,
          relatedId: user?.id,
          typeRef: 'User',
          targetId,
          postType: 'invite',
        })
      );

      const filtered = notifications.filter(
        (n) => !(n.type === 'requestInvite' && n.relatedId === relatedId && n.targetId === targetId)
      );
      dispatch(setNotifications(filtered));
    } catch (error) {
      console.error('❌ Error rejecting join request:', error);
    }
  };

  const handleDeleteNotification = (notificationId) => {
    if (!isBusiness) {
      dispatch(deleteNotification({ userId: user.id, notificationId }));
    } else {
      dispatch(deleteBusinessNotification({ placeId, notificationId }));
    }
  };

  const handleFollowBack = async (targetUserId, notificationId) => {
    try {
      await dispatch(followUserImmediately({ targetUserId, isFollowBack: true }));

      const enrichedUser = followers.find((u) => u._id === targetUserId);
      const fullNameFollowBack = enrichedUser
        ? `${enrichedUser.firstName} ${enrichedUser.lastName}`
        : 'them';

      await dispatch(
        createNotification({
          userId: targetUserId,
          type: 'follow',
          message: `${fullName} started following you back.`,
          relatedId: userId,
          typeRef: 'User',
        })
      );

      const updatedNotifications = notifications.map((n) =>
        n._id === notificationId
          ? {
              ...n,
              type: 'follow',
              message: `You followed ${fullNameFollowBack} back.`,
              read: true,
            }
          : n
      );
      dispatch(setNotifications(updatedNotifications));
    } catch (error) {
      console.error('Error following back:', error);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={[...(notifications || [])].sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        )}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <SwipeableRow onSwipe={handleDeleteNotification} notificationId={item._id}>
            <TouchableWithoutFeedback onPress={() => handleNotificationPress(item)}>
              <View
                style={[
                  styles.notificationCard,
                  !item.read && styles.unreadNotification,
                ]}
              >
                {item?.type !== 'followRequest' && (
                  <View style={styles.iconContainer}>
                    {getNotificationIcon(item.type)}
                  </View>
                )}
                <NotificationTextContent
                  item={item}
                  sender={(followRequests.received || []).find((u) => u._id === item.relatedId)}
                  shouldShowFollowBack={
                    (item.type === 'followRequestAccepted' ||
                      item.type === 'follow' ||
                      item.type === 'followRequest') &&
                    !following.some((u) => u._id === item.relatedId) &&
                    followers.some((u) => u._id === item.relatedId)
                  }
                  onAcceptRequest={() => handleAcceptRequest(item.relatedId)}
                  onDeclineRequest={() => handleDeclineRequest(item.relatedId)}
                  onAcceptInvite={() => handleAcceptInvite(item.targetId)}
                  onRejectInvite={() => handleRejectInvite(item.targetId)}
                  onAcceptJoinRequest={() =>
                    handleAcceptJoinRequest(item.relatedId, item.targetId)
                  }
                  onRejectJoinRequest={() =>
                    handleRejectJoinRequest(item.relatedId, item.targetId)
                  }
                  onFollowBack={() => handleFollowBack(item.relatedId, item._id)}
                />
                {!item.read && <View style={styles.unreadDot} />}
              </View>
            </TouchableWithoutFeedback>
          </SwipeableRow>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    paddingVertical: 10,
    marginTop: 120,
    paddingBottom: 100,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    marginVertical: 5,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  unreadNotification: {
    backgroundColor: '#E7F3FF',
  },
  iconContainer: {
    marginRight: 10,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1877F2',
    marginLeft: 10,
  },
});
