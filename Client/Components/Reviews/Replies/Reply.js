import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableWithoutFeedback, Image } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import { setSelectedComment, setSelectedReply } from '../../../Slices/CommentThreadSlice';
import { selectMediaFromGallery } from '../../../utils/selectPhotos';
import VideoThumbnail from '../VideoThumbnail';
import { uploadReviewPhotos } from '../../../Slices/PhotosSlice';
import { isVideo } from '../../../utils/isVideo';
import EditReplyInput from './EditReplyInput';
import LikeButton from './LikeButton';
import ReplyActionsBar from './ReplyActionsBar';
import NestedReply from './NestedReply';
import {
  addReply as addReplyGeneric,
  toggleLike as toggleLikeGeneric,
  toApiPostType,
} from '../../../Slices/CommentsSlice';

const Reply = ({
  reply,
  onAddReply,                    // parent can still pass this; we’ll prefer generic thunk
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
  postType,                      // singular like 'review', 'promotion', etc.
  postId,
  review,
  selectedMedia,
  setSelectedMedia,
  setSelectedEditMedia,
}) => {
  const dispatch = useDispatch();
  const [nestedReplyText, setNestedReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const user = useSelector(selectUser);
  const userId = user?.id;
  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  const apiPostType = toApiPostType(postType);
  const media = reply?.media;
  const mediaUrl = media?.mediaUrl || media?.url || null;

  const setNativeRef = (node) => {
    if (node) commentRefs.current[reply._id] = node;
  };

  const handleSelectReplyMedia = async () => {
    const files = await selectMediaFromGallery();
    if (files?.length > 0) {
      setSelectedMedia([files[0]]);    // exactly 1 file
      setSelectedEditMedia(files[0]);
    }
  };

  const handleAddNestedReply = async () => {
    if (!nestedReplyText.trim()) return;

    let mediaPayload = null;
    if (selectedMedia?.length > 0) {
      try {
        const uploadResult = await dispatch(
          uploadReviewPhotos({
            placeId: review?.placeId,   // ok if undefined for some post types
            files: selectedMedia,
          })
        ).unwrap();

        if (uploadResult?.length > 0) {
          const file = selectedMedia[0];
          mediaPayload = {
            photoKey: uploadResult[0],
            mediaType: file.type?.startsWith('video') ? 'video' : 'image',
          };
        }
      } catch (err) {
        console.error('Reply media upload failed', err);
      }
    }

    // ✅ Use the generic nested reply endpoint.
    await dispatch(
      addReplyGeneric({
        postType: apiPostType,
        postId,
        commentId: reply._id,             // parent is this reply -> deep nesting supported
        commentText: nestedReplyText.trim(),
        ...(mediaPayload && { media: mediaPayload }),
      })
    );

    // reset UI state
    setNestedReplyText('');
    setShowReplyInput(false);
    setNestedReplyInput(false);
    setSelectedMedia([]);
    handleExpandReplies(reply._id);       // show the new reply
  };

  // ✅ Generic like/unlike for this reply node.
  const handleToggleLike = async () => {
    await dispatch(
      toggleLikeGeneric({
        postType: apiPostType,
        postId,
        commentId: reply._id,             // listener figures out if it’s nested and finds top-level id
      })
    );
  };

  return (
    <TouchableWithoutFeedback onLongPress={() => handleLongPress(reply, true, parentCommentId)}>
      <View ref={setNativeRef} style={styles.replyContainer}>
        <View style={styles.replyBubble}>
          <Text style={styles.replyAuthor}>{reply.fullName}:</Text>
          {/* edit mode for this reply */}
          {isEditing && selectedReply?._id === reply._id ? (
            <EditReplyInput
              editedText={editedText}
              setEditedText={setEditedText}
              selectedMedia={selectedMedia}
              setSelectedMedia={setSelectedMedia}
              setSelectedEditMedia={setSelectedEditMedia}
              handleSelectReplyMedia={handleSelectReplyMedia}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setIsEditing(false)}
            />
          ) : (
            <View style={styles.textRow}>
              <View style={{ flexDirection: 'column' }}>
                {media && media.photoKey && (
                  isVideo(media)
                    ? <VideoThumbnail file={media} width={200} height={200} />
                    : <Image source={{ uri: mediaUrl }} style={styles.image} />
                )}
                <Text style={styles.commentText}>{reply.commentText}</Text>
              </View>
              <View style={styles.likeRow}>
                {/* 🔁 If LikeButton can accept an override handler, pass it */}
                <LikeButton
                  node={reply}
                  userId={userId}
                  onToggleLike={handleToggleLike}
                  // (Optional) keep legacy props for backward compat in LikeButton
                  postType={apiPostType}
                  postId={postId}
                />
              </View>
            </View>
          )}
        </View>
        {/* Reply button row */}
        <ReplyActionsBar
          reply={reply}
          showReplyInput={showReplyInput}
          toggleReplyInput={() => {
            setShowReplyInput(!showReplyInput);
            setNestedReplyInput(!nestedReplyInput);
          }}
          getTimeSincePosted={getTimeSincePosted}
          nestedExpandedReplies={nestedExpandedReplies}
          handleExpandReplies={handleExpandReplies}
        />
        {/* Nested reply input */}
        {showReplyInput && (
          <NestedReply
            nestedReplyText={nestedReplyText}
            setNestedReplyText={setNestedReplyText}
            selectedMedia={selectedMedia}
            setSelectedMedia={setSelectedMedia}
            setSelectedEditMedia={setSelectedEditMedia}
            handleSelectReplyMedia={handleSelectReplyMedia}
            handleAddNestedReply={handleAddNestedReply}
          />
        )}
        {/* Render deeper nested replies */}
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
              postId={postId}
              review={review}
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
  replyContainer: { marginLeft: 20, padding: 10, borderRadius: 5 },
  replyBubble: { backgroundColor: '#f0f2f5', padding: 10, borderRadius: 15 },
  replyAuthor: { fontSize: 13, fontWeight: 'bold', color: '#333' },
  textRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  likeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  image: { width: 200, height: 200, borderRadius: 8, marginBottom: 6, marginTop: 5 },
  commentText: { fontSize: 14, color: '#222' },
});
