import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';
import VideoThumbnail from './VideoThumbnail';
import { isVideo } from '../../utils/isVideo';
import { selectMediaFromGallery } from '../../utils/selectPhotos';

const CommentInputFooter = ({
  commentText,
  setCommentText,
  handleAddComment,
  inputHeight,
  setContentHeight,
  setSelectedMedia,
  selectedMedia, // ✅ Pass down selected media to show previews
}) => {
  const handleSelectMedia = async () => {
    const files = await selectMediaFromGallery();
    if (files?.length > 0) {
      setSelectedMedia(files);
    }
  };

  return (
    <View style={styles.commentInputContainer}>
      {/* Media Icon */}
      <TouchableOpacity onPress={handleSelectMedia} style={styles.mediaIcon}>
        <Text style={styles.mediaIconText}>📷</Text>
      </TouchableOpacity>

      {/* Input wrapper with media and TextInput */}
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
          style={[styles.commentInput]}
          placeholder="Write a comment..."
          value={commentText}
          onChangeText={setCommentText}
          multiline={true}
          textAlignVertical="top"
          onContentSizeChange={(event) => {
            setContentHeight(event.nativeEvent.contentSize.height);
          }}
        />
      </View>

      {/* Post Button */}
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
  },
  commentInput: {
    fontSize: 14,
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
  mediaIcon: {
    marginRight: 10,
    padding: 4,
  },
  mediaIconText: {
    fontSize: 20,
  },
  mediaPreviewContainer: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 10,
  },
  mediaThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 5,
    marginRight: 10,
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
  commentInputText: {
    fontSize: 14,
    minHeight: 40,
  },
});
