import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Text } from 'react-native-paper';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

dayjs.extend(relativeTime);

const ConversationCard = ({ conversation, onPress, currentUserId }) => {
  const { otherUser, lastMessage, updatedAt } = conversation;
  const fullName = `${otherUser.firstName} ${otherUser.lastName}`;
  const timeAgo = updatedAt ? dayjs(updatedAt).fromNow(true) : '';

  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Image
        source={otherUser.profilePicUrl ? { uri: otherUser.profilePicUrl } : profilePicPlaceholder}
        style={styles.avatar}
      />
      <View style={styles.textContainer}>
        <Text style={styles.name}>{fullName}</Text>
        {lastMessage?.content && (
          <Text style={styles.preview} numberOfLines={1}>
            {lastMessage.senderId === currentUserId ? 'You: ' : ''}{lastMessage.content}
          </Text>
        )}
      </View>
      <Text style={styles.timestamp}>{timeAgo}</Text>
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
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
  },
});

export default ConversationCard;
