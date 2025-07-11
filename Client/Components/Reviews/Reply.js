import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, TouchableWithoutFeedback, Image, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import { toggleCommentLike } from '../../Slices/ReviewsSlice';
import { findTopLevelCommentId } from '../../functions';
import { setSelectedComment, setSelectedReply } from '../../Slices/CommentThreadSlice';
import { hasLikedCheck } from '../../utils/LikeHandlers/hasLikedCheck';
import { selectMediaFromGallery } from '../../utils/selectPhotos';
import VideoThumbnail from './VideoThumbnail';
import { uploadReviewPhotos } from '../../Slices/PhotosSlice';
import { isVideo } from '../../utils/isVideo';

const Reply = ({
  reply,
  onAddReply,
  getTimeSincePosted,
  nestedExpandedReplies,
  setNestedExpandedReplies,
  handleExpandReplies,
  commentRefs,
  handleLongPress,
  parentCommentId,
  nestedReplyInput,
  setNestedReplyInput,
  handleEditComment,
  handleSaveEdit,
  setIsEditing,
  setEditedText,
  isEditing,
  editedText,
  selectedReply,
  postType,
  placeId,
  postId,
  review,
  likePromoEventComment,
  isPromoOrEvent = false,
  selectedMedia,
  setSelectedMedia,
  setSelectedEditMedia,
}) => {
  const dispatch = useDispatch();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [nestedReplyText, setNestedReplyText] = useState('');
  const user = useSelector(selectUser);
  const likes = reply?.likes || [];
  const userId = user?.id;
  const hasLiked = hasLikedCheck(likes, userId);
  const media = reply?.media;

  const setNativeRef = (node) => {
    if (node) {
      commentRefs.current[reply._id] = node; // Store native handle
    }
  };

  const handleSelectReplyMedia = async () => {
    const files = await selectMediaFromGallery();
    if (files.length > 0) {
      setSelectedMedia([files[0]]); // ensure only one is stored
      setSelectedEditMedia(files[0]);
    }
  };

  const handleAddNestedReply = async () => {
    let media = null;

    if (selectedMedia.length > 0) {
      try {
        const uploadResult = await dispatch(
          uploadReviewPhotos({
            placeId: review.placeId,
            files: selectedMedia,
          })
        ).unwrap();

        if (uploadResult?.length > 0) {
          const file = selectedMedia[0]; // Only support one media file for now
          media = {
            photoKey: uploadResult[0],
            mediaType: file.type?.startsWith("video") ? "video" : "image",
          };
        }
      } catch (err) {
        console.error("Reply media upload failed", err);
      }
    }

    await onAddReply(reply._id, nestedReplyText, media); // Update your thunk to support media

    setNestedReplyText('');
    setShowReplyInput(false);
    setNestedReplyInput(false);
    setSelectedMedia([]);
    handleExpandReplies(reply._id);
  };

  const handleToggleLike = () => {
    const topLevelCommentId = findTopLevelCommentId(review.comments, reply._id);
    //if (!topLevelCommentId) return;

    if (!isPromoOrEvent) {
      dispatch(toggleCommentLike({
        postType,
        placeId,
        postId,
        commentId: topLevelCommentId, // ✅ root-level comment ID
        replyId: reply._id,
        userId,
      }));
    } else {
      likePromoEventComment(reply._id);
    }
  };

  return (
    <TouchableWithoutFeedback
      onLongPress={() => handleLongPress(reply, true, parentCommentId)}
    >
      <View ref={setNativeRef} style={styles.replyContainer}>
        <View style={styles.replyBubble}>
          <Text style={styles.replyAuthor}>{reply.fullName}:</Text>
          {/* Show TextInput if editing, otherwise show text */}
          {isEditing && selectedReply?._id === reply._id ? (
            <>
              <View style={styles.inputWrapper}>
                <View style={styles.fakeInput}>
                  {selectedMedia?.length > 0 && (
                    <View style={styles.inlineMediaWrapper}>
                      {selectedMedia.map((file, idx) =>
                        isVideo(file) ? (
                          <VideoThumbnail
                            key={idx}
                            file={file}
                            width={100}
                            height={100}
                            shouldPlay={false}
                          />
                        ) : (
                          <Image
                            key={idx}
                            source={{ uri: file.uri || file.mediaUrl }}
                            style={styles.inlineMedia}
                          />
                        )
                      )}
                    </View>
                  )}
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
                        setSelectedMedia([]);
                        setSelectedEditMedia(null);
                      }
                    }}
                    autoFocus
                    multiline
                    placeholder="Edit your reply..."
                  />
                </View>
                <TouchableOpacity onPress={handleSelectReplyMedia} style={styles.mediaIcon}>
                  <MaterialCommunityIcons name="image-outline" size={22} color="#009999" />
                </TouchableOpacity>
              </View>

              {/* Save and Cancel Buttons */}
              <View style={styles.editButtonContainer}>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.textRow}>
              <View style={{ flexDirection: 'column' }}>
                {media && media.photoKey && (
                  isVideo(media)
                    ? <VideoThumbnail file={media} width={200} height={200} />
                    : <Image source={{ uri: media?.mediaUrl }} style={styles.image} />
                )}
                <Text style={styles.commentText}>{reply.commentText}</Text>
              </View>
              <View style={styles.likeRow}>
                <TouchableOpacity onPress={handleToggleLike} style={styles.likeButton}>
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
        {/* Reply button */}
        <View style={styles.replyButtonContainer}>
          <Text style={styles.replyDate}>{getTimeSincePosted(reply.date)}</Text>
          <TouchableOpacity
            onPress={() => {
              setShowReplyInput(!showReplyInput);
              setNestedReplyInput(!nestedReplyInput);
            }}
            style={styles.replyButton}
          >
            <MaterialCommunityIcons name="comment-outline" size={20} color="#808080" />
            <Text style={styles.replyButtonText}>{showReplyInput ? 'Cancel' : 'Reply'}</Text>
          </TouchableOpacity>
          {/* Expand/collapse replies */}
          {reply.replies && reply.replies.length > 0 && (
            <TouchableOpacity
              onPress={() => handleExpandReplies(reply._id)}
              style={styles.expandRepliesButton}
            >
              <MaterialCommunityIcons
                name={nestedExpandedReplies[reply._id] ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#808080"
              />
              <Text style={styles.replyCountText}>
                {reply.replies.length} {reply.replies.length > 1 ? 'replies' : 'reply'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Nested reply input */}
        {showReplyInput && (
          <View style={styles.nestedReplyInputContainer}>
            <View style={styles.fakeInputBox}>
              {/* Media Preview */}
              {selectedMedia.length > 0 && (
                <View style={styles.mediaPreview}>
                  {selectedMedia.map((file, index) =>
                    isVideo(file) ? (
                      <VideoThumbnail key={index} file={file} width={100} height={100} />
                    ) : (
                      <Image
                        key={index}
                        source={{ uri: file.uri }}
                        style={styles.previewImage}
                      />
                    )
                  )}
                </View>
              )}
              {/* Text Input */}
              <TextInput
                style={styles.nestedReplyInput}
                placeholder="Write a reply..."
                value={nestedReplyText}
                onChangeText={setNestedReplyText}
                onKeyPress={({ nativeEvent }) => {
                  if (
                    nativeEvent.key === 'Backspace' &&
                    editedText.trim().length === 0 &&
                    selectedMedia.length > 0
                  ) {
                    setSelectedMedia([]);
                    setSelectedEditMedia(null);
                  }
                }}
                multiline
              />
              {/* Camera Icon Overlay */}
              {nestedReplyText.trim() === '' && selectedMedia.length === 0 && (
                <TouchableOpacity onPress={handleSelectReplyMedia} style={styles.cameraIcon}>
                  <MaterialCommunityIcons name="camera-outline" size={24} color="#555" />
                </TouchableOpacity>
              )}
            </View>
            {/* Submit Reply */}
            <TouchableOpacity style={styles.commentButton} onPress={handleAddNestedReply}>
              <Text style={styles.commentButtonText}>Reply</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Render nested replies */}
        {nestedExpandedReplies[reply._id] &&
          reply?.replies?.map((nestedReply) => (
            <Reply
              key={nestedReply._id}
              reply={nestedReply}
              onAddReply={onAddReply}
              getTimeSincePosted={getTimeSincePosted}
              nestedExpandedReplies={nestedExpandedReplies}
              setNestedExpandedReplies={setNestedExpandedReplies}
              commentRefs={commentRefs}
              handleLongPress={handleLongPress}
              parentCommentId={reply._id}
              setSelectedReply={setSelectedReply}
              setSelectedComment={setSelectedComment}
              handleExpandReplies={handleExpandReplies}
              nestedReplyInput={nestedReplyInput}
              setNestedReplyInput={setNestedReplyInput}
              handleEditComment={handleEditComment}
              handleSaveEdit={handleSaveEdit}
              setIsEditing={setIsEditing}
              setEditedText={setEditedText}
              isEditing={isEditing}
              editedText={editedText}
              selectedReply={selectedReply}
              postType={postType}
              placeId={placeId}
              postId={postId}
              review={review}
              likePromoEventComment={likePromoEventComment}
              isPromoOrEvent={isPromoOrEvent}
              selectedMedia={selectedMedia}
              setSelectedMedia={setSelectedMedia}
              setSelectedEditMedia={setSelectedEditMedia}
            />
          ))}
      </View>
    </TouchableWithoutFeedback>
  );
};

export default Reply;

const styles = StyleSheet.create({
  replyContainer: {
    marginLeft: 20,
    padding: 10,
    borderRadius: 5,
  },
  replyBubble: {
    backgroundColor: '#f0f2f5',
    backgroundColor: '#f0f2f5',
    padding: 10,
    borderRadius: 15,
  },
  replyButtonContainer: {
    flexDirection: 'row',
    marginLeft: 10,
    marginTop: 5,
  },
  replyAuthor: {
    fontSize: 13,
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
    marginRight: 10,
  },
  replyButtonText: {
    fontSize: 14,
    color: '#009999',
    fontWeight: 'bold',
  },
  nestedReplyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  nestedReplyInput: {
    fontSize: 14,
  },
  commentButton: {
    backgroundColor: '#009999',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 5,
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
    alignItems: 'center',
    marginRight: 10,
  },
  expandRepliesButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyCountText: {
    fontSize: 14,
    color: '#888',
  },
  editButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  saveButton: {
    backgroundColor: '#009999',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 5,
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
    marginLeft: 5,
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
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
  cameraIcon: {
    position: 'absolute',
    right: 20,
    top: 8
  },
  inputWrapper: {
    marginTop: 8,
  },
  fakeInputBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 8,
    position: 'relative',
    backgroundColor: '#fff',
  },
  fakeInput: {
    flexDirection: 'column',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 6,
    backgroundColor: '#fff',
    minHeight: 50,
  },
  mediaPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 6,
    marginTop: 5
  },
  mediaPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  mediaPreviewInline: {
    marginBottom: 6,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  previewImageInline: {
    width: 200,
    height: 200,
    borderRadius: 10,
    marginBottom: 8,
  },
  inlineMedia: {
    width: 200,
    height: 200,
    borderRadius: 6,
  },
  inlineInput: {
    width: '100%',
    fontSize: 14,
    padding: 0,
    margin: 0,
    textAlignVertical: 'top',
    marginTop: 5,
  },
  mediaIcon: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
});
