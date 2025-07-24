import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ExpandRepliesButton from './ExpandRepliesButton';

const ReplyActionsBar = ({
  reply,
  showReplyInput,
  toggleReplyInput,
  getTimeSincePosted,
  nestedExpandedReplies,
  handleExpandReplies,
}) => {
  return (
    <View style={styles.replyButtonContainer}>
      {/* Timestamp */}
      <Text style={styles.replyDate}>{getTimeSincePosted(reply.date)}</Text>
      {/* Reply button */}
      <TouchableOpacity onPress={toggleReplyInput} style={styles.replyButton}>
        <MaterialCommunityIcons name="comment-outline" size={20} color="#808080" />
        <Text style={styles.replyButtonText}>{showReplyInput ? 'Cancel' : 'Reply'}</Text>
      </TouchableOpacity>
      {/* Expand/collapse replies */}
      {reply.replies?.length > 0 && (
        <ExpandRepliesButton
          isExpanded={nestedExpandedReplies[reply._id]}
          replyCount={reply.replies.length}
          onPress={() => handleExpandReplies(reply._id)}
        />
      )}
    </View>
  );
};

export default ReplyActionsBar;

const styles = StyleSheet.create({
  replyButtonContainer: {
    flexDirection: 'row',
    marginLeft: 10,
    marginTop: 5,
  },
  replyDate: {
    fontSize: 12,
    color: '#777',
    marginRight: 10,
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  replyButtonText: {
    fontSize: 14,
    color: '#009999',
    fontWeight: 'bold',
  },
});
