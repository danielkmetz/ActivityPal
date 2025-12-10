import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import moment from 'moment';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import getNotificationIcon from './getNotificationIcon';

export default function NotificationTextContent({
  item,
  sender,
  shouldShowFollowBack,
  onAcceptRequest,
  onDeclineRequest,
  onAcceptInvite,
  onRejectInvite,
  onAcceptJoinRequest,
  onRejectJoinRequest,
  onFollowBack,
  onOpenDetails = () => {},
}) {
  const { type, createdAt, commentText, message } = item || {};
  const isInviteType = type === 'activityInvite' || type === 'activityInviteReminder';
  const isAcceptedInvite = type === 'activityInviteAccepted';
  const isFollowRequest = type === 'followRequest';
  const senderProfilePic = sender?.presignedProfileUrl;

  return (
    <View style={[ styles.textContainer, isFollowRequest && { marginLeft: 10 } ]}>
      {/* FOLLOW REQUEST: keep existing layout, no Details button needed here */}
      {isFollowRequest && sender ? (
        <>
          <View style={styles.friendRequestContainer}>
            <Image
              source={
                senderProfilePic ? { uri: senderProfilePic } : profilePicPlaceholder
              }
              style={styles.profilePic}
            />
            <Text style={styles.message}>{message}</Text>
          </View>
          {commentText && <Text style={styles.commentText}>{commentText}</Text>}
          <View style={styles.momentRow}>
            <View style={styles.inlineIcon}>{getNotificationIcon(type)}</View>
            <Text style={styles.timestamp}>{moment(createdAt).fromNow()}</Text>
          </View>
        </>
      ) : (
        <View style={styles.mainRow}>
          {/* Left column: message + comment + timestamp */}
          <View style={styles.leftColumn}>
            <Text style={styles.message} numberOfLines={2}>
              {message}
            </Text>

            {commentText && (
              <Text style={styles.commentText}>{commentText}</Text>
            )}

            <View style={styles.momentRow}>
              <Text style={styles.timestamp}>{moment(createdAt).fromNow()}</Text>
            </View>
          </View>
          {/* Right side: Details button for accepted invites */}
          {isAcceptedInvite && (
            <TouchableOpacity
              style={styles.detailsButton}
              onPress={onOpenDetails}
              activeOpacity={0.8}
            >
              <Text style={styles.detailsButtonText}>Details</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {/* Follow request action buttons */}
      {isFollowRequest && sender && (
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.acceptButton} onPress={onAcceptRequest}>
            <Text style={styles.buttonText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineButton} onPress={onDeclineRequest}>
            <Text style={styles.buttonText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Activity invite buttons (pre-response) */}
      {isInviteType && (
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.acceptButton} onPress={onAcceptInvite}>
            <Text style={styles.buttonText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineButton} onPress={onRejectInvite}>
            <Text style={styles.buttonText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Request-to-join buttons (host handling) */}
      {type === 'requestInvite' && (
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.acceptButton} onPress={onAcceptJoinRequest}>
            <Text style={styles.buttonText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineButton} onPress={onRejectJoinRequest}>
            <Text style={styles.buttonText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Follow back */}
      {shouldShowFollowBack && (
        <TouchableOpacity style={styles.followBackButton} onPress={onFollowBack}>
          <Text style={styles.buttonText}>Follow Back</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  textContainer: { flex: 1 },
  friendRequestContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  profilePic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center', 
  },
  leftColumn: {
    flex: 1,
    marginRight: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  commentText: {
    marginVertical: 4,
  },
  momentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  inlineIcon: { marginRight: 8 },
  timestamp: {
    fontSize: 12,
    color: '#777',
  },
  buttonGroup: { flexDirection: 'row', marginTop: 8 },
  acceptButton: {
    backgroundColor: '#33cccc',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  declineButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  followBackButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  detailsButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  detailsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
