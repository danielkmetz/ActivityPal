import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import CommentBubble from './CommentBubble';
import CommentActions from './CommentActions';
import CommentOptionsModal from './CommentOptionsModal';
import Reply from './Replies/Reply';
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
import { selectUser } from '../../Slices/UserSlice';
import { selectMediaFromGallery } from '../../utils/selectPhotos';
import { uploadReviewPhotos } from '../../Slices/PhotosSlice';
import MediaPreview from './Photos/MediaPreview';
import { deleteSharedPostComment, toggleLikeOnSharedPostComment, addReplyToSharedPost, editSharedPostComment } from '../../Slices/SharedPostsSlice';

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
  const fullName = `${user?.firstName} ${user.lastName}`;

  const getTimeSincePosted = (dateString) => dayjs(dateString).fromNow(true);

  const handleSelectMedia = async () => {
    const files = await selectMediaFromGallery();
    if (files.length > 0) {
      setSelectedMedia([files[0]]); // ensure only one is stored
    }
  };

  const handleAddReply = async () => {
    if (!review || !replyingTo || !commentText.trim()) return;

    let media = null;

    if (selectedMedia.length > 0) {
      const mediaFile = selectedMedia[0];

      try {
        const result = await dispatch(
          uploadReviewPhotos({
            placeId: review.placeId, // may be undefined for shared posts (and that’s OK)
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

    const isSharedPost = review?.type === 'sharedPost';

    if (isSharedPost) {
      dispatch(
        addReplyToSharedPost({
          sharedPostId: review._id,
          commentId: replyingTo,
          userId,
          fullName,
          commentText: commentText.trim(),
          ...(media && { media }),
        })
      );
    } else {
      dispatch(
        addNewReply({
          review,
          replyingTo,
          commentText: commentText.trim(),
          userId,
          fullName,
          ...(media && { media }),
        })
      );
    }

    dispatch(setReplyingTo(null));
    setCommentText('');
    setSelectedMedia([]);
    setShowReplyInput(false);
  };

  const handleAddNestedReply = (replyId, replyText, media) => {
    const isSharedPost = review?.type === 'sharedPost';

    const payload = {
      commentId: replyId,
      userId,
      fullName: `${user?.firstName} ${user?.lastName}`,
      commentText: replyText?.trim(),
      ...(media && { media }),
    };

    if (isSharedPost) {
      dispatch(
        addReplyToSharedPost({
          sharedPostId: review._id,
          ...payload,
        })
      );
    } else {
      dispatch(
        addNewNestedReply({
          review,
          parentCommentId: replyId,
          replyText: replyText?.trim(),
          userId,
          fullName: `${user?.firstName} ${user?.lastName}`,
          ...(media && { media }),
        })
      );
    }

    dispatch(setReplyingTo(null));
    setCommentText('');
    setSelectedMedia([]);
    setShowReplyInput(false);
  };

  const handleCancelEdit = () => {
    dispatch(setIsEditing(false));
    dispatch(setEditedText(''));
  };

  const handleToggleLike = (commentId, replyId = null) => {
    if (!review || !commentId) return;

    const isSharedPost = review.type === 'sharedPost';

    if (isSharedPost) {
      dispatch(toggleLikeOnSharedPostComment({
        sharedPostId: review._id,
        commentId,
        userId,
        fullName,
      }));
    } else {
      dispatch(toggleCommentLike({
        postType: review.type || 'review',
        placeId: review.placeId || userPlaceId,
        postId: review._id,
        commentId,
        replyId,
        userId,
      }));
    }
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
    if (!review || (!selectedComment && !selectedReply)) return;

    const isSharedPost = review.type === 'sharedPost';

    if (isSharedPost) {
      dispatch(deleteSharedPostComment({
        sharedPostId: review._id,
        commentId: selectedReply?._id || selectedComment._id,
      }));
    } else {
      dispatch(removeCommentOrReply({
        postType: review.type || 'review',
        placeId: review.placeId,
        postId: review._id,
        commentId: selectedComment._id,
        relatedId: selectedReply?._id || null,
      }));
    }

    setOptionsVisible(false);
  };

  const handleEditComment = () => {
    const selected = selectedReply || selectedComment;
    if (!selected) return;

    dispatch(setIsEditing(true));
    dispatch(setEditedText(selected.commentText));

    const media = selected?.media;
    setSelectedEditMedia(media || null);
    setSelectedMedia(media ? [media] : []); // ✅ fix here

    setOptionsVisible(false);
  };

  const handleSaveEdit = async () => {
    const selected = selectedReply || selectedComment;

    if (!selected) return;

    const isSharedPost = review?.type === 'sharedPost';
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
            placeId: review?.placeId,
            files: [selectedEditMedia],
          })
        ).unwrap();

        if (result?.length > 0) {
          newMedia = {
            photoKey: result[0],
            mediaType: selectedEditMedia.type?.startsWith("video") ? "video" : "image",
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

    if (!editedText?.trim()) return;

    try {
      if (isSharedPost) {
        await dispatch(
          editSharedPostComment({
            sharedPostId: review._id,
            commentId: selected._id,
            newText: editedText,
            media: newMedia,
          })
        );
      } else {
        await dispatch(
          saveEditedCommentOrReply({
            review,
            selected,
            editedText,
            userId,
            ...(newMedia !== undefined && { media: newMedia }),
          })
        );
      }
    } catch (err) {
      return;
    }

    dispatch(setIsEditing(false));
    dispatch(setEditedText(''));
    dispatch(setSelectedComment(null));
    dispatch(setSelectedReply(null));
    dispatch(setReplyingTo(null));
    setSelectedMedia([]);
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
                  {item.replies?.length} {item.replies?.length > 1 ? 'replies' : 'reply'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {replyingTo === item._id && (
            <View style={styles.nestedReplyInputContainer}>
              <View style={styles.fakeInputBox}>
                <MediaPreview mediaFiles={selectedMedia} />
                <TextInput
                  style={styles.nestedReplyInput}
                  placeholder="Write a reply..."
                  value={commentText}
                  onChangeText={setCommentText}
                />
                {commentText.trim() === '' && selectedMedia?.length === 0 && (
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
                  selectedMedia={selectedMedia}
                  setSelectedEditMedia={setSelectedEditMedia}
                  setSelectedMedia={setSelectedMedia}
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
  fakeInputBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 8,
    position: 'relative',
    backgroundColor: '#fff',
  },
});
