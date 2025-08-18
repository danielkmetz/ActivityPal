import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Image, } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { hasLikedCheck } from '../../utils/LikeHandlers/hasLikedCheck';
import { selectMediaFromGallery } from '../../utils/selectPhotos';
import { isVideo } from '../../utils/isVideo';
import VideoThumbnail from './VideoThumbnail';
import MediaPreview from './Photos/MediaPreview';

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
  media,
  selectedMedia = [],
  setSelectedMedia = () => { },
  setSelectedEditMedia = () => { }, 
}) => {
  const hasLiked = hasLikedCheck(likes, userId);
  const mediaUrl = media?.url || media?.mediaUrl;

  const handleSelectMedia = async () => {
    const files = await selectMediaFromGallery();
    if (files.length > 0) {
      const file = files[0];
      setSelectedMedia([file]);
      setSelectedEditMedia(file); // ✅ pass file, not [file]
    }
  };

  return (
    <View style={[styles.commentBubble, isReply && { marginLeft: 20 }]}>
      <Text style={styles.commentAuthor}>{fullName}:</Text>
      {isEditing && isSelected ? (
        <View style={styles.inputWrapper}>
          <View style={styles.fakeInput}>
            <MediaPreview mediaFiles={selectedMedia} width={150} height={150} />
            <TextInput
              style={styles.inlineInput}
              value={editedText}
              onChangeText={setEditedText}
              onKeyPress={({ nativeEvent }) => {
                if (
                  nativeEvent.key === 'Backspace' &&
                  editedText.trim().length === 0 &&
                  selectedMedia.length > 0
                ) {
                  setSelectedMedia([]); // Remove image
                  setSelectedEditMedia(null);
                }
              }}
              autoFocus
              multiline
              placeholder="Add a comment..."
            />
          </View>
          <TouchableOpacity onPress={handleSelectMedia} style={styles.mediaIcon}>
            <MaterialCommunityIcons name="image-outline" size={22} color="#009999" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.textRow}>
          <View style={{ flexDirection: 'column' }}>
            {media && media.photoKey && (
              isVideo(media)
                ? <VideoThumbnail file={media} width={200} height={200} />
                : <Image source={{ uri: mediaUrl }} style={styles.image} />
            )}
            <Text style={styles.comment}>{commentText}</Text>
          </View>
          <View style={styles.likeRow}>
            <TouchableOpacity onPress={() => onToggleLike(commentId)} style={styles.likeButton}>
              <MaterialCommunityIcons
                name={hasLiked ? 'thumb-up' : 'thumb-up-outline'}
                size={16}
                color={hasLiked ? '#009999' : '#999'}
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
    alignSelf: 'center',
    marginBottom: 8,
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
  mediaIcon: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 6,
    marginTop: 5
  },
  inputWrapper: {
    marginTop: 6,
  },
  fakeInput: {
    flexDirection: 'column',
    flexWrap: 'wrap',
    //alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 6,
    backgroundColor: '#fff',
    minHeight: 50,
  },
  inlineInput: {
    width: '100%',
    fontSize: 14,
    padding: 0, // remove default padding
    margin: 0,
    textAlignVertical: 'top',
    marginTop: 5,
  },
});