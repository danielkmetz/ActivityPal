import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Text } from 'react-native-paper';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

dayjs.extend(relativeTime);
const AVATAR_SIZE = 32;
const OVERLAP_OFFSET = 10;

const ConversationCard = ({ conversation, onPress, currentUserId }) => {
  const { otherUsers = [], lastMessage, updatedAt } = conversation;
  const timeAgo = updatedAt ? dayjs(updatedAt).fromNow(true) : '';
  const isUnread = lastMessage && !lastMessage.isRead && lastMessage.senderId !== currentUserId;
  const fullName = otherUsers.map(u => `${u.firstName} ${u.lastName}`).join(', ');
  const visibleAvatars = otherUsers.slice(0, 3);
  const avatarGroupWidth = AVATAR_SIZE + (visibleAvatars.length - 1) * (AVATAR_SIZE - OVERLAP_OFFSET);

  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <View
        style={[
          styles.avatarGroup,
          visibleAvatars.length > 1
            ? { minWidth: avatarGroupWidth }
            : { width: AVATAR_SIZE },
        ]}
      >
        {otherUsers.slice(0, 3).map((user, index) => (
          <Image
            key={user._id}
            source={user.profilePicUrl ? { uri: user.profilePicUrl } : profilePicPlaceholder}
            style={[styles.groupAvatar, { marginLeft: index === 0 ? 0 : -10 }]}
          />
        ))}
      </View>

      <View style={styles.textContainer}>
        <View style={{ maxWidth: 170 }}>
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {fullName}
          </Text>
        </View>
        {lastMessage?.content && (
          <Text style={styles.preview} numberOfLines={1}>
            {lastMessage.senderId === currentUserId ? 'You: ' : ''}
            {lastMessage.content}
          </Text>
        )}
      </View>

      <View style={styles.timestampWrapper}>
        {isUnread && <View style={styles.unreadDot} />}
        <Text style={styles.timestamp}>{timeAgo}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  avatarGroup: {
    flexDirection: 'row',
    marginRight: 12,
    width: 48, // reserves consistent space
  },
  groupAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'white',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 2,
  },
  preview: {
    color: '#555',
    fontSize: 14,
  },
  timestamp: {
    fontSize: 12,
    color: '#888',
    marginLeft: 6,
  },
  timestampWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'red',
    marginRight: 6,
  },
});

export default ConversationCard;
