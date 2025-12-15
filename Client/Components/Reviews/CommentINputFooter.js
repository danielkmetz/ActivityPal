import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from 'react-native';
import VideoThumbnail from './VideoThumbnail';
import { isVideo } from '../../utils/isVideo';
import { selectMediaFromGallery } from '../../utils/selectPhotos';
import { FontAwesome } from '@expo/vector-icons';

const CommentInputFooter = ({
  commentText,
  setCommentText,
  handleAddComment,
  setSelectedMedia,
  selectedMedia,
}) => {
  const handleSelectMedia = async () => {
    const files = await selectMediaFromGallery();
    if (files?.length > 0) {
      setSelectedMedia(files);
    }
  };

  return (
    <View style={styles.commentInputContainer}>
      <View style={styles.fakeInputBox}>
        {selectedMedia?.length > 0 && (
          <View style={styles.inlineMedia}>
            {isVideo(selectedMedia[0]) ? (
              <VideoThumbnail file={selectedMedia[0]} width={120} height={120} shouldPlay={false} />
            ) : (
              <Image source={{ uri: selectedMedia[0].uri }} style={styles.inlineImage} />
            )}
          </View>
        )}
        <TextInput
          style={styles.commentInput}
          placeholder="Write a comment..."
          value={commentText}
          onChangeText={setCommentText}
          multiline
          textAlignVertical="top"
        />
        {/* anchored icon */}
        <TouchableOpacity
          style={styles.mediaIconButton}
          onPress={handleSelectMedia}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <FontAwesome name="picture-o" size={18} color="#777" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.commentButton} onPress={handleAddComment}>
        <Text style={styles.commentButtonText}>Post</Text>
      </TouchableOpacity>
    </View>
  );
};

export default CommentInputFooter;

const styles = StyleSheet.create({
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingBottom: 15,
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  fakeInputBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 8,
    backgroundColor: '#fff',
    position: 'relative', // IMPORTANT for absolute icon
  },
  commentInput: {
    fontSize: 14,
    paddingRight: 34, // IMPORTANT so text doesn't overlap icon
  },
  mediaIconButton: {
    position: 'absolute',
    right: 8,
    bottom: 3, 
    padding: 6,
    borderRadius: 14,
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
  inlineMedia: {
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  inlineImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
});
