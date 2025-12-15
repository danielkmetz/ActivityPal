import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import dayjs from 'dayjs';
import CommentBubble from './CommentBubble';
import CommentActions from './CommentActions';
import CommentOptionsModal from './CommentOptionsModal';
import Reply from './Replies/Reply';
import MediaPreview from './Photos/MediaPreview';
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
} from '../../Slices/CommentThreadSlice';
import { selectUser } from '../../Slices/UserSlice';
import { selectMediaFromGallery } from '../../utils/selectPhotos';
import { uploadReviewPhotos } from '../../Slices/PhotosSlice';
import { FontAwesome } from '@expo/vector-icons';
import {
  addReply as addReplyGeneric,
  toggleLike as toggleLikeGeneric,
  editComment as editCommentGeneric,
  deleteComment as deleteCommentGeneric,
} from '../../Slices/CommentsSlice';
import { selection } from '../../utils/Haptics/haptics';

export default function CommentThread({
  item,                  // the top-level comment object
  review,                // the post object containing this comment
  commentRefs,
  commentText, setCommentText,
  selectedMedia, setSelectedMedia,
}) {
  const dispatch = useDispatch();
  const [isOptionsVisible, setOptionsVisible] = useState(false);
  const [selectedEditMedia, setSelectedEditMedia] = useState(null); // image/video object or null
  const user = useSelector(selectUser);
  const userId = user?.id;
  const replyingTo = useSelector(selectReplyingTo);
  const selectedComment = useSelector(selectSelectedComment);
  const selectedReply = useSelector(selectSelectedReply);
  const isEditing = useSelector(selectIsEditing);
  const editedText = useSelector(selectEditedText);
  const expandedReplies = useSelector(selectExpandedReplies);
  const nestedExpandedReplies = useSelector(selectNestedExpandedReplies);
  const nestedReplyInput = useSelector(selectNestedReplyInput);
  const postType = review?.type || review?.postType || review?.kind;
  const postId = review?._id;

  const getTimeSincePosted = (dateString) => dayjs(dateString).fromNow(true);

  const handleSelectMedia = async () => {
    const files = await selectMediaFromGallery();
    if (files?.length > 0) setSelectedMedia([files[0]]);
  };

  // Add a reply to a **top-level comment** (replyingTo contains the comment _id)
  const handleAddReply = async () => {
    if (!review || !replyingTo || !commentText.trim()) return;

    let media = null;

    if (selectedMedia?.length > 0) {
      const mediaFile = selectedMedia[0];
      try {
        const result = await dispatch(
          uploadReviewPhotos({
            placeId: review.placeId, // ok if undefined for some post types
            files: [mediaFile],
          })
        ).unwrap();

        if (result?.length > 0) {
          media = {
            photoKey: result[0],
            mediaType: mediaFile.type?.startsWith('video') ? 'video' : 'image',
          };
        }
      } catch (error) {
        console.error('Media upload failed:', error);
      }
    }

    // ✅ Generic reply endpoint (works for top-level & nested; here it's top-level)
    await dispatch(
      addReplyGeneric({
        postType,
        postId,
        commentId: replyingTo,           // parent comment id
        commentText: commentText.trim(),
        ...(media && { media }),
      })
    );

    // reset UI state
    dispatch(setReplyingTo(null));
    setCommentText('');
    setSelectedMedia([]);
  };

  // Add a reply to a **reply** (nested)
  const handleAddNestedReply = async (replyId, replyText, media) => {
    if (!review || !replyId || !replyText?.trim()) return;

    await dispatch(
      addReplyGeneric({
        postType,
        postId,
        commentId: replyId,            // parent is a reply id (server handles deep nesting)
        commentText: replyText.trim(),
        ...(media && { media }),
      })
    );

    dispatch(setReplyingTo(null));
    setCommentText('');
    setSelectedMedia([]);
  };

  const handleCancelEdit = () => {
    dispatch(setIsEditing(false));
    dispatch(setEditedText(''));
    setSelectedEditMedia(null);
    setSelectedMedia([]);
  };

  // Like/unlike either a top-level comment OR a reply.
  // Pass whichever id was tapped as `commentId`; the listener figures out ancestry if needed.
  const handleToggleLike = (commentId, replyId = null) => {
    if (!review || !commentId) return;
    const targetId = replyId || commentId;
    dispatch(toggleLikeGeneric({ postType, postId, commentId: targetId }));
    selection();
  };

  const handleReplyToggle = () => {
    dispatch(setReplyingTo(replyingTo === item._id ? null : item._id));
    setCommentText('');
  };

  const handleExpandReplies = (replyId) => {
    const updated = { ...nestedExpandedReplies, [replyId]: !nestedExpandedReplies[replyId] };
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

  // Delete selected comment/reply (generic)
  const handleDeleteCommentOrReply = async () => {
    const targetId = selectedReply?._id || selectedComment?._id;
    if (!review || !targetId) return;

    await dispatch(deleteCommentGeneric({ postType, postId, commentId: targetId }));
    setOptionsVisible(false);
  };

  // Enter edit mode with current text/media
  const handleEditComment = () => {
    const selected = selectedReply || selectedComment;
    if (!selected) return;

    dispatch(setIsEditing(true));
    dispatch(setEditedText(selected.commentText));

    const media = selected?.media || null;
    setSelectedEditMedia(media);
    setSelectedMedia(media ? [media] : []);
    setOptionsVisible(false);
  };

  // Save edited comment/reply (uploads new media if needed)
  const handleSaveEdit = async () => {
    const selected = selectedReply || selectedComment;
    if (!selected) return;

    let newMedia = undefined; // undefined = don't touch media; null = remove media; object = replace

    // Cases:
    // - User cleared media: selectedEditMedia === null  => set newMedia = null
    // - Kept existing server media: selectedEditMedia has { photoKey } => copy as-is
    // - Picked a new local file: selectedEditMedia has uri but no photoKey => upload then set newMedia
    if (selectedEditMedia === null) {
      newMedia = null; // remove media
    } else if (selectedEditMedia?.photoKey) {
      newMedia = {
        photoKey: selectedEditMedia.photoKey,
        mediaType: selectedEditMedia.mediaType || 'image',
      };
    } else if (selectedEditMedia?.uri && !selectedEditMedia?.photoKey) {
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
            mediaType: selectedEditMedia.type?.startsWith('video') ? 'video' : 'image',
          };
        }
      } catch (error) {
        console.error('Media upload (edit) failed:', error);
        return;
      }
    }
    if (!editedText?.trim()) return;

    await dispatch(
      editCommentGeneric({
        postType,
        postId,
        commentId: selected._id,
        newText: editedText.trim(),
        ...(newMedia !== undefined && { media: newMedia }),
      })
    );

    // reset UI state
    dispatch(setIsEditing(false));
    dispatch(setEditedText(''));
    dispatch(setSelectedComment(null));
    dispatch(setSelectedReply(null));
    dispatch(setReplyingTo(null));
    setSelectedEditMedia(null);
    setSelectedMedia([]);
  };

  return (
    <View>
      <TouchableWithoutFeedback onLongPress={() => handleLongPress(item)}>
        <View
          onLayout={(e) => {
            if (item?._id) commentRefs.current[item._id] = e.nativeEvent.target;
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
                {commentText.trim() === '' && (selectedMedia?.length ?? 0) === 0 && (
                  <TouchableOpacity onPress={handleSelectMedia} style={styles.cameraIcon}>
                    <FontAwesome name="picture-o" size={18} color="#777" />
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
                  postType={postType}
                  placeId={review?.placeId}
                  postId={postId}
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
  commentCard: { marginVertical: 5 },
  commentButton: {
    backgroundColor: '#009999',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  commentDate: { fontSize: 12, color: '#777', marginRight: 10, marginLeft: 20 },
  commentButtonText: { color: '#fff', fontWeight: 'bold' },
  nestedReplyInputContainer: {
    flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 30, marginHorizontal: 10,
  },
  nestedReplyInput: { fontSize: 14 },
  replyContainer: { flexDirection: 'row', marginLeft: 10 },
  expandRepliesButton: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  replyCountText: { fontSize: 14, color: '#888' },
  cameraIcon: { position: 'absolute', right: 20, top: 8 },
  fakeInputBox: {
    flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 8, position: 'relative', backgroundColor: '#fff',
  },
  repliesContainer: { marginLeft: 10, marginTop: 8 },
});
