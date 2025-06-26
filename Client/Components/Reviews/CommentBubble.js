import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { hasLikedCheck } from '../../utils/LikeHandlers/hasLikedCheck';

const CommentBubble = ({
  fullName,
  commentText,
  isEditing,
  editedText,
  setEditedText,
  isSelected,
  commentId,
  likes = [],
  userId,
  onToggleLike,
  isReply = false,
}) => {
  const hasLiked = hasLikedCheck(likes, userId);
  
  return (
    <View style={[styles.commentBubble, isReply && { marginLeft: 20 }]}>
      <Text style={styles.commentAuthor}>{fullName}:</Text>
      {isEditing && isSelected ? (
        <TextInput
          style={styles.editInput}
          value={editedText}
          onChangeText={setEditedText}
          autoFocus
          multiline
        />
      ) : (
        <View style={styles.textRow}>
          <Text style={styles.commentText}>{commentText}</Text>
          <View style={styles.likeRow}>
            <TouchableOpacity onPress={() => onToggleLike(commentId)} style={styles.likeButton}>
              <MaterialCommunityIcons
                name={hasLiked ? "thumb-up" : "thumb-up-outline"}
                size={16}
                color={hasLiked ? "#009999" : "#999"}
              />
              <Text style={styles.likeCount}>{Array.isArray(likes) ? likes.length : 0}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

export default CommentBubble;

const styles = StyleSheet.create({
  commentBubble: {
    backgroundColor: '#f0f2f5',
    padding: 10,
    borderRadius: 15,
    width: '90%',
    alignSelf: 'center'
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  commentText: {
    fontSize: 14,
    color: '#555',
  },
  editInput: {
    backgroundColor: '#f9f9f9',
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 5,
    padding: 8,
    fontSize: 14,
    minHeight: 40,
  },
  textRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  likeCount: {
    fontSize: 12,
    color: '#777',
    marginLeft: 4,
  },
});
