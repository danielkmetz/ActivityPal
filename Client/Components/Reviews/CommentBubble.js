// components/CommentBubble.js
import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

const CommentBubble = ({
  fullName,
  commentText,
  isEditing,
  editedText,
  setEditedText,
  isSelected,
}) => {
  return (
    <View style={styles.commentBubble}>
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
        <Text style={styles.commentText}>{commentText}</Text>
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
    marginVertical: 5,
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
});
