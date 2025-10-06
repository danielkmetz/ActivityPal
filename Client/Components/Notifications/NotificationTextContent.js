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
}) {
  return (
    <View style={[styles.textContainer, item.type === 'followRequest' && { marginLeft: 10 }]}>
      {item?.type === 'followRequest' && sender ? (
        <View style={styles.friendRequestContainer}>
          <Image
            source={sender.presignedProfileUrl ? { uri: sender.presignedProfileUrl } : profilePicPlaceholder}
            style={styles.profilePic}
          />
          <Text style={styles.message}>{item.message}</Text>
        </View>
      ) : (
        <Text style={styles.message}>{item.message}</Text>
      )}
      {item?.commentText ? <Text style={styles.commentText}>{item?.commentText}</Text> : null}
      <View style={styles.momentRow}>
        {item.type === 'followRequest' && (
          <View style={styles.inlineIcon}>
            {getNotificationIcon(item.type)}
          </View>
        )}
        <Text style={styles.timestamp}>{moment(item.createdAt).fromNow()}</Text>
      </View>
      {/* Follow request buttons */}
      {item.type === 'followRequest' && sender && (
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.acceptButton} onPress={onAcceptRequest}>
            <Text style={styles.buttonText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineButton} onPress={onDeclineRequest}>
            <Text style={styles.buttonText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Activity invite buttons */}
      {item.type === 'activityInvite' && (
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.acceptButton} onPress={onAcceptInvite}>
            <Text style={styles.buttonText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineButton} onPress={onRejectInvite}>
            <Text style={styles.buttonText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Request to join buttons */}
      {item.type === 'requestInvite' && (
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
  profilePic: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  message: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  commentText: { marginVertical: 10 },
  momentRow: { flexDirection: 'row', alignItems: 'center' },
  inlineIcon: { marginRight: 8 },
  timestamp: { fontSize: 12, color: '#777', marginTop: 2 },
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
});
