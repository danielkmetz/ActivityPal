import React, { useState, useRef } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
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
import { fetchPostById } from '../../Slices/PostsSlice';
import { decrementLastSeenUnreadCount } from '../../utils/notificationsHasSeen';
import { normalizePostType } from '../../utils/normalizePostType';
import NotificationRow from './NotificationRow';
import { buildInitialBusinessFromInvite } from '../../utils/InviteDetails/buildBusiness';
// 
// Photo tags are rendering "unable to find content" when the post does not exist yet because of pagination
// 
// Helper: pick the right fetch thunk (all go through unified fetch now)
const getFetchAction = ({ postType, targetId }) => {
  const pt = normalizePostType(postType);
  // For fetching, treat "post" as generic: let the backend infer the subtype
  const fetchType = pt === 'post' ? undefined : pt;
  return fetchPostById({ postType: fetchType, postId: targetId });
};

// Helper: unify 404 detection across action or AxiosError
const isNotFound = (resOrErr) => {
  if (!resOrErr) return false;

  const statusFromPayload =
    resOrErr?.payload?.status || resOrErr?.payload?.response?.status;
  const statusFromError =
    resOrErr?.error?.status ||
    resOrErr?.error?.code ||
    resOrErr?.error?.response?.status;
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

/* -------------------------- main component -------------------------- */

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
  const [photoTapped, setPhotoTapped] = useState(null); // kept for CommentScreen compat
  const lastTapRef = useRef({});
  const userId = user?.id;
  const placeId = user?.businessDetails?.placeId;
  const fullName = `${user?.firstName} ${user?.lastName}`;

  const handleNotificationPress = async (notification) => {
    if (!notification) return;
    
    const {
      type,
      postType,
      targetId,
      commentId,
      replyId,
      _id: notificationId,
    } = notification;

    const target = replyId || commentId;

    // Mark as read first
    try {
      if (!isBusiness) {
        dispatch(markNotificationRead({ userId: user.id, notificationId }));
      } else {
        dispatch(markBusinessNotificationRead({ placeId, notificationId }));
      }

      await decrementLastSeenUnreadCount();
    } catch (e) {
      // optional: keep a single error log if you want
      console.error('Error while marking notification read / decrementing unread:', e);
    }

    // Notification types that should open a post
    const contentTypes = [
      'comment',
      'review',
      'check-in',
      'reply',
      'like',
      'tag',
      'photoTag',
      'activityInvite',
      'requestInvite',
      'activityInviteAccepted',
      'activityInviteDeclined',
      'activityInviteReminder',
      'activityInviteNeedsRecap',
    ];

    if (!contentTypes.includes(type)) {
      return;
    }

    const normalizedPostType = normalizePostType(postType);

    if (!targetId) {
      return;
    }
    console.log('[NotifPress]', { type, postType, normalizedPostType, targetId });

    try {
      const action = await dispatch(
        getFetchAction({ postType: normalizedPostType, targetId })
      );

      const payload = action?.payload ?? null;
      const notFoundFromAction = isNotFound(action);

      if (action?.meta?.requestStatus === 'rejected') {
        if (notFoundFromAction) {
          navigation.navigate('Notifications');
          showMissingAlert();
          return;
        }

        Alert.alert('Error', 'Unable to load the content.');
        return;
      }

      if (!payload || notFoundFromAction) {
        navigation.navigate('Notifications');
        showMissingAlert();
        return;
      }

      const pt = normalizedPostType;

      // 🔹 SPECIAL CASE: recap reminders → go straight to CreatePost
      if (type === 'activityInviteNeedsRecap') {
        const initialBusiness = buildInitialBusinessFromInvite(payload);

        navigation.navigate('CreatePost', {
          postType: 'review',        // recap = review (you can change this if needed)
          relatedInviteId: targetId, // link recap back to invite
          ...(initialBusiness ? { initialBusiness } : {}),
        });

        return;
      }

      // Invites → InviteDetails
      if (pt === 'invite') {
        navigation.navigate('InviteDetails', {
          postId: targetId,
        });
        return;
      }

      // Events & promos → EventDetails
      if (pt === 'event' || pt === 'promotion') {
        navigation.navigate('EventDetails', {
          activity: payload,
          activityId: targetId,
        });
        return;
      }

      // Everything else → CommentScreen
      navigation.navigate('CommentScreen', {
        reviewId: targetId, // kept prop name for backwards compatibility
        targetId: target,
        lastTapRef,
        photoTapped,
      });
    } catch (err) {
      const notFoundFromError = isNotFound(err);

      if (notFoundFromError) {
        navigation.navigate('Notifications');
        showMissingAlert();
      } else {
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

  const handleDeleteNotification = (notificationId) => {
    if (!isBusiness) {
      dispatch(deleteNotification({ userId: user.id, notificationId }));
    } else {
      dispatch(deleteBusinessNotification({ placeId, notificationId }));
    }
  };

  const handleFollowBack = async (targetUserId, notificationId) => {
    try {
      await dispatch(
        followUserImmediately({ targetUserId, isFollowBack: true })
      );

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
          <NotificationRow
            item={item}
            followRequests={followRequests}
            following={following}
            followers={followers}
            onPress={handleNotificationPress}
            onDelete={handleDeleteNotification}
            onAcceptRequest={handleAcceptRequest}
            onDeclineRequest={handleDeclineRequest}
            onFollowBack={handleFollowBack}
          />
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
});
