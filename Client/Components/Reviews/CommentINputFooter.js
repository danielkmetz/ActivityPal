// components/CommentInputFooter.js
import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const CommentInputFooter = ({
  commentText,
  setCommentText,
  handleAddComment,
  onClose,
  inputHeight,
  contentHeight,
  setContentHeight,
}) => {
  return (
    <>
      <View style={styles.commentInputContainer}>
        <TextInput
          style={[styles.commentInput, { height: inputHeight }]}
          placeholder="Write a comment..."
          value={commentText}
          onChangeText={setCommentText}
          multiline={true}
          textAlignVertical="top"
          onContentSizeChange={(event) => {
            setContentHeight(event.nativeEvent.contentSize.height);
          }}
        />
        <TouchableOpacity style={styles.commentButton} onPress={handleAddComment}>
          <Text style={styles.commentButtonText}>Post</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onClose} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>Close</Text>
      </TouchableOpacity>
    </>
  );
};

export default CommentInputFooter;

const styles = StyleSheet.create({
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 15,
  },
  commentInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingHorizontal: 10,
    minHeight: 40,
  },
  commentButton: {
    backgroundColor: '#009999',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  commentButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  closeButton: {
    alignSelf: 'center',
    marginBottom: 30,
  },
  closeButtonText: {
    color: '#009999',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
