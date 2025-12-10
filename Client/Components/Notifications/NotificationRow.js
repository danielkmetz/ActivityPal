import React from 'react';
import { View, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import SwipeableRow from './SwipeableRow';
import NotificationTextContent from './NotificationTextContent';
import getNotificationIcon from './getNotificationIcon';
import useInviteActions from '../../utils/UserInviteActions/userInviteActions';

export default function NotificationRow({
  item,
  followRequests,
  following,
  followers,
  onPress,
  onDelete,
  onAcceptRequest,
  onDeclineRequest,
  onFollowBack,
}) {
  // Only invite-related notifications should use the invite hook
  const isInviteNotification =
    item?.postType === 'invite' ||
    item?.type === 'activityInvite' ||
    item?.type === 'requestInvite' || 
    item?.type === 'activityInviteReminder';

  // Minimal stub – hook only needs an inviteId
  const inviteStub = isInviteNotification
    ? { _id: item.targetId }
    : null;

  const { acceptForMe, declineForMe, acceptJoinRequest, rejectJoinRequest } = useInviteActions(inviteStub);

  const sender = (followRequests.received || []).find(
    (u) => u._id === item.relatedId
  );

  const shouldShowFollowBack =
    (item.type === 'followRequestAccepted' ||
      item.type === 'follow' ||
      item.type === 'followRequest') &&
    !following.some((u) => u._id === item.relatedId) &&
    followers.some((u) => u._id === item.relatedId);

  return (
    <SwipeableRow onSwipe={onDelete} notificationId={item._id}>
      <TouchableWithoutFeedback onPress={() => onPress(item)}>
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
            sender={sender}
            shouldShowFollowBack={shouldShowFollowBack}
            // follow request (user-to-user)
            onAcceptRequest={() => onAcceptRequest(item.relatedId)}
            onDeclineRequest={() => onDeclineRequest(item.relatedId)}
            // invite for *me* (centralized via hook)
            onAcceptInvite={acceptForMe}
            onRejectInvite={declineForMe}
            // host accepting/rejecting "request to join" (centralized via hook)
            onAcceptJoinRequest={() => acceptJoinRequest(item.relatedId)}
            onRejectJoinRequest={() => rejectJoinRequest(item.relatedId)}
            // follow back
            onFollowBack={() => onFollowBack(item.relatedId, item._id)}
            onOpenDetails={() => onPress(item)}
          />
          {!item.read && <View style={styles.unreadDot} />}
        </View>
      </TouchableWithoutFeedback>
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
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
