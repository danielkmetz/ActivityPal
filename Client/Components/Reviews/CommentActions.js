// components/CommentActions.js
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const CommentActions = ({
  isEditing,
  isSelected,
  onSaveEdit,
  onCancelEdit,
  onReply,
  isReplying,
}) => {
  return (
    <View style={styles.actionsContainer}>
      {isEditing && isSelected ? (
        <>
          <TouchableOpacity onPress={onSaveEdit} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancelEdit} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity onPress={onReply} style={styles.replyButton}>
          <MaterialCommunityIcons name="comment-outline" size={20} color="#808080" />
          <Text style={styles.replyButtonText}>{isReplying ? 'Cancel' : 'Reply'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default CommentActions;

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  saveButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#ccc',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyButtonText: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: 'bold',
    marginLeft: 5,
  },
});
