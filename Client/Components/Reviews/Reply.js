import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const Reply = ({ reply, onAddReply, getTimeSincePosted }) => {
    const [showReplyInput, setShowReplyInput] = useState(false);
    const [nestedReplyText, setNestedReplyText] = useState('');
    const [expandedReplies, setExpandedReplies] = useState(false);

    const handleAddNestedReply = async () => {
        if (!nestedReplyText) return;
        await onAddReply(reply._id, nestedReplyText); // Pass reply ID and text
        setNestedReplyText('');
        setShowReplyInput(false);
        setExpandedReplies(true);
    };

    return (
        <View style={styles.replyContainer}>
            <Text style={styles.replyAuthor}>{reply.fullName}:</Text>
            <Text style={styles.replyText}>{reply.commentText}</Text>
            <Text style={styles.replyDate}>{getTimeSincePosted(reply.date)}</Text>

            {/* Reply button */}
            <TouchableOpacity onPress={() => setShowReplyInput(!showReplyInput)} style={styles.replyButton}>
                <MaterialCommunityIcons name="comment-outline" size={20} color="#808080" />
                <Text style={styles.replyButtonText}>{showReplyInput ? 'Cancel' : 'Reply'}</Text>
            </TouchableOpacity>

            {/* Nested reply input */}
            {showReplyInput && (
                <View style={styles.nestedReplyInputContainer}>
                    <TextInput
                        style={styles.nestedReplyInput}
                        placeholder="Write a reply..."
                        value={nestedReplyText}
                        onChangeText={setNestedReplyText}
                    />
                    <TouchableOpacity style={styles.commentButton} onPress={handleAddNestedReply}>
                        <Text style={styles.commentButtonText}>Reply</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Expand/collapse replies */}
            {reply.replies && reply.replies.length > 0 && (
                <TouchableOpacity
                    onPress={() => setExpandedReplies(!expandedReplies)}
                    style={styles.expandRepliesButton}
                >
                    <MaterialCommunityIcons
                        name={expandedReplies ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#808080"
                    />
                    <Text style={styles.replyCountText}>
                        {reply.replies.length} {reply.replies.length > 1 ? 'replies' : 'reply'}
                    </Text>
                </TouchableOpacity>
            )}

            {/* Render nested replies */}
            {expandedReplies &&
                reply.replies.map((nestedReply) => (
                    <Reply
                        key={nestedReply._id}
                        reply={nestedReply}
                        onAddReply={onAddReply}
                        getTimeSincePosted={getTimeSincePosted}
                    />
                ))}
        </View>
    );
};

export default Reply;

const styles = StyleSheet.create({
  replyContainer: {
    marginLeft: 20,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  replyAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  replyText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  replyDate: {
    fontSize: 12,
    color: '#777',
    marginBottom: 5,
  },
  replyButtonText: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: 'bold',
  },
  nestedReplyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  nestedReplyInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingHorizontal: 10,
    marginRight: 10,
  },
  commentButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  commentButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  nestedReplies: {
    marginTop: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#ddd',
    paddingLeft: 10,
  },
  replyButton: {
    flexDirection: 'row',
    marginTop: 10,
    alignItems: 'center',
  },
  
});
