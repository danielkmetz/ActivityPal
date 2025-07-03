import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, Image, ScrollView } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import CommentBubble from './CommentBubble';
import CommentActions from './CommentActions';
import CommentOptionsModal from './CommentOptionsModal';
import VideoThumbnail from './VideoThumbnail';
import Reply from './Reply';
import dayjs from 'dayjs';
import {
  selectReplyingTo,
  selectSelectedComment,
  selectSelectedReply,
  selectIsEditing,
  selectEditedText,
  selectExpandedReplies,
  selectNestedExpandedReplies,
  selectNestedReplyInput,
  setReplyingTo,
  setEditedText,
  setNestedReplyInput,
  toggleReplyExpansion,
  setSelectedReply,
  setSelectedComment,
  setNestedExpandedReplies,
  setIsEditing,
  saveEditedCommentOrReply,
  addNewReply,
  addNewNestedReply,
  removeCommentOrReply,
} from '../../Slices/CommentThreadSlice';
import { toggleCommentLike } from '../../Slices/ReviewsSlice';
import { isVideo } from '../../utils/isVideo';
import { selectUser } from '../../Slices/UserSlice';
import { selectMediaFromGallery } from '../../utils/selectPhotos';
import { uploadReviewPhotos } from '../../Slices/PhotosSlice';

export default function CommentThread({ item, review, commentRefs, commentText, setCommentText, selectedMedia, setSelectedMedia }) {
  const dispatch = useDispatch();
  const [isOptionsVisible, setOptionsVisible] = useState(false);
  const user = useSelector(selectUser);
  const userId = user?.id;
  const userPlaceId = user?.businessDetails?.placeId || null;
  const replyingTo = useSelector(selectReplyingTo);
  const selectedComment = useSelector(selectSelectedComment);
  const selectedReply = useSelector(selectSelectedReply);
  const isEditing = useSelector(selectIsEditing);
  const editedText = useSelector(selectEditedText);
  const [selectedEditMedia, setSelectedEditMedia] = useState(null); // can be image or video object
  const expandedReplies = useSelector(selectExpandedReplies);
  const nestedExpandedReplies = useSelector(selectNestedExpandedReplies);
  const nestedReplyInput = useSelector(selectNestedReplyInput);

  const getTimeSincePosted = (dateString) => dayjs(dateString).fromNow(true);

  const handleSelectMedia = async () => {
    const files = await selectMediaFromGallery();
    if (files.length > 0) {
      setSelectedMedia([files[0]]); // ensure only one is stored
    }
  };

  const handleAddReply = async () => {
    let media = null;

    if (selectedMedia.length > 0) {
      const mediaFile = selectedMedia[0];

      try {
        const result = await dispatch(
          uploadReviewPhotos({
            placeId: review.placeId,
            files: [mediaFile],
          })
        ).unwrap();

        if (result?.length > 0) {
          media = {
            photoKey: result[0],
            mediaType: mediaFile.type.startsWith('video') ? 'video' : 'image',
          };
        }
      } catch (error) {
        console.error('❌ Media upload failed:', error);
      }
    }

    dispatch(addNewReply({
      review,
      replyingTo,
      commentText,
      userId,
      fullName: `${user?.firstName} ${user?.lastName}`,
      ...(media && { media }),
    }));

    setCommentText('');
    setSelectedMedia([]);
  };

  const handleAddNestedReply = (replyId, replyText, media) => {
    dispatch(addNewNestedReply({
      review,
      parentCommentId: replyId,
      replyText,
      userId,
      media: selectedMedia,
      fullName: `${user?.firstName} ${user?.lastName}`,
      media,
    }));
    dispatch(setReplyingTo(null));
    setCommentText('');
    setSelectedMedia([]);
  };

  const handleCancelEdit = () => {
    dispatch(setIsEditing(false));
    dispatch(setEditedText(''));
  };

  const handleToggleLike = (commentId) => {
    dispatch(toggleCommentLike({
      postType: review.type,
      placeId: review.placeId || userPlaceId,
      postId: review._id,
      commentId,
      userId,
      replyId: null,
    }));
  };

  const handleReplyToggle = () => {
    dispatch(setReplyingTo(replyingTo === item._id ? null : item._id));
    setCommentText('');
  };

  const handleExpandReplies = (replyId) => {
    const updated = {
      ...nestedExpandedReplies,
      [replyId]: !nestedExpandedReplies[replyId], // toggle instead of force-true
    };
    dispatch(setNestedExpandedReplies(updated));
  };

  const handleLongPress = (commentOrReply, isReply = false, parentId = null) => {
    const authorId = commentOrReply?.userId;

    if (authorId !== userId) return;

    if (isReply) {
      dispatch(setSelectedReply({ ...commentOrReply, parentCommentId: parentId }));
      dispatch(setSelectedComment(null));
    } else {
      dispatch(setSelectedComment(commentOrReply));
      dispatch(setSelectedReply(null));
    }

    setOptionsVisible(true);
  };

  const handleDeleteCommentOrReply = () => {
    dispatch(removeCommentOrReply({
      review,
      selectedComment,
      selectedReply,
    }));

    setOptionsVisible(false);
  };

  const handleEditComment = () => {
    const selected = selectedReply || selectedComment;
    if (!selected) return;

    dispatch(setIsEditing(true));
    dispatch(setEditedText(selected.commentText));

    const media = selected.media;
    setSelectedEditMedia(media || null);
    setSelectedMedia(media ? [media] : []); // ✅ fix here

    setOptionsVisible(false);
  };

  const handleSaveEdit = async () => {
    const selected = selectedReply || selectedComment;
    if (!selected) return;

    const originalMedia = selectedMedia;
    let newMedia = null;

    if (!selectedEditMedia && originalMedia?.length > 0) {
      newMedia = null;
    } else if (
      selectedEditMedia &&
      selectedEditMedia.uri &&
      !selectedEditMedia.photoKey
    ) {
      try {
        const result = await dispatch(
          uploadReviewPhotos({
            placeId: post.placeId,
            files: [selectedEditMedia],
          })
        ).unwrap();

        if (result?.length > 0) {
          newMedia = {
            photoKey: result[0],
            mediaType: isVideo(selectedEditMedia) ? "video" : "image",
          };
        }
      } catch (error) {
        return;
      }
    } else if (selectedEditMedia?.photoKey) {
      newMedia = {
        photoKey: selectedEditMedia.photoKey,
        mediaType: selectedEditMedia.mediaType || "image",
      };
    }

    await dispatch(
      saveEditedCommentOrReply({
        review,
        selected,
        editedText,
        userId,
        ...(newMedia !== undefined && { media: newMedia }), // send new, old, or null
      })
    );

    setSelectedEditMedia(null);
    setSelectedMedia(null);
  };

  return (
    <View>
      <TouchableWithoutFeedback
        onLongPress={() => handleLongPress(item)}
      >
        <View
          onLayout={(e) => {
            if (item?._id) {
              commentRefs.current[item._id] = e.nativeEvent.target;
            }
          }}
          style={styles.commentCard}
        >
          <CommentBubble
            fullName={item.fullName}
            commentText={item.commentText}
            isEditing={isEditing}
            editedText={editedText}
            setEditedText={(text) => dispatch(setEditedText(text))}
            isSelected={selectedComment?._id === item._id}
            review={review}
            commentId={item._id}
            likes={item.likes}
            userId={userId}
            isReply={false}
            onToggleLike={handleToggleLike}
            selectedMedia={selectedMedia}
            setSelectedMedia={setSelectedMedia}
            setSelectedEditMedia={setSelectedEditMedia}
            media={item.media}
          />
          <View style={styles.replyContainer}>
            <Text style={styles.commentDate}>{getTimeSincePosted(item.date)}</Text>
            <CommentActions
              isEditing={isEditing}
              isSelected={selectedComment?._id === item._id}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onReply={handleReplyToggle}
              isReplying={replyingTo === item._id}
            />
            {item.replies?.length > 0 && (
              <TouchableOpacity
                onPress={() => dispatch(toggleReplyExpansion(item._id))}
                style={styles.expandRepliesButton}
              >
                <MaterialCommunityIcons
                  name={expandedReplies[item._id] ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#808080"
                />
                <Text style={styles.replyCountText}>
                  {item.replies.length} {item.replies.length > 1 ? 'replies' : 'reply'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {replyingTo === item._id && (
            <View style={styles.nestedReplyInputContainer}>
              <View style={styles.fakeInputBox}>
                {selectedMedia?.length > 0 && (
                  <ScrollView horizontal style={styles.previewContainer}>
                    {selectedMedia.map((file, idx) =>
                      isVideo(file) ? (
                        <VideoThumbnail
                          key={idx}
                          file={file}
                          width={70}
                          height={70}
                          shouldPlay={false}
                        />
                      ) : (
                        <Image
                          key={idx}
                          source={{ uri: file.uri }}
                          style={styles.previewImage}
                        />
                      )
                    )}
                  </ScrollView>
                )}
                <TextInput
                  style={styles.nestedReplyInput}
                  placeholder="Write a reply..."
                  value={commentText}
                  onChangeText={setCommentText}
                />
                {commentText.trim() === '' && selectedMedia.length === 0 && (
                  <TouchableOpacity onPress={handleSelectMedia} style={styles.cameraIcon}>
                    <MaterialCommunityIcons name="camera-outline" size={24} color="#555" />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={styles.commentButton} onPress={handleAddReply}>
                <Text style={styles.commentButtonText}>Reply</Text>
              </TouchableOpacity>
            </View>
          )}
          {expandedReplies[item._id] && item.replies?.length > 0 && (
            <View style={styles.repliesContainer}>
              {item.replies.map((reply) => (
                <Reply
                  key={reply._id}
                  reply={reply}
                  onAddReply={handleAddNestedReply}
                  getTimeSincePosted={getTimeSincePosted}
                  nestedExpandedReplies={nestedExpandedReplies}
                  setNestedExpandedReplies={(payload) => dispatch(setNestedExpandedReplies(payload))}
                  commentRefs={commentRefs}
                  handleExpandReplies={handleExpandReplies}
                  handleLongPress={handleLongPress}
                  parentCommentId={item._id}
                  nestedReplyInput={nestedReplyInput}
                  setNestedReplyInput={(val) => dispatch(setNestedReplyInput(val))}
                  handleEditComment={() => dispatch(setIsEditing(true))}
                  handleSaveEdit={handleSaveEdit}
                  setIsEditing={(val) => dispatch(setIsEditing(val))}
                  setEditedText={(val) => dispatch(setEditedText(val))}
                  isEditing={isEditing}
                  editedText={editedText}
                  selectedReply={selectedReply}
                  postType={review?.type}
                  placeId={review?.placeId}
                  postId={review?._id}
                  review={review}
                />
              ))}
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      <CommentOptionsModal
        isVisible={isOptionsVisible}
        onClose={() => setOptionsVisible(false)}
        onEdit={handleEditComment}
        onDelete={handleDeleteCommentOrReply}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  commentCard: {
    marginVertical: 5,
  },
  commentButton: {
    backgroundColor: '#009999',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  commentDate: {
    fontSize: 12,
    color: '#777',
    marginRight: 10,
    marginLeft: 20,
  },
  commentButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  nestedReplyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
    marginHorizontal: 10,
  },
  nestedReplyInput: {
    fontSize: 14,
  },
  replyContainer: {
    flexDirection: 'row',
    marginLeft: 10,
  },
  expandRepliesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  replyCountText: {
    fontSize: 14,
    color: '#888',
  },
  cameraIcon: {
    position: 'absolute',
    right: 20,
    top: 5
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
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
});
