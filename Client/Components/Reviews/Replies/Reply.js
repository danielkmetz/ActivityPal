import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableWithoutFeedback, Image } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import { setSelectedComment, setSelectedReply } from '../../../Slices/CommentThreadSlice';
import { selectMediaFromGallery } from '../../../utils/selectPhotos';
import VideoThumbnail from '../VideoThumbnail';
import { uploadReviewPhotos } from '../../../Slices/PhotosSlice';
import { addReplyToSharedPost } from '../../../Slices/SharedPostsSlice';
import { isVideo } from '../../../utils/isVideo';
import EditReplyInput from './EditReplyInput';
import LikeButton from './LikeButton';
import ReplyActionsBar from './ReplyActionsBar';
import NestedReply from './NestedReply';

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
  const dispatch = useDispatch()
  const [nestedReplyText, setNestedReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const user = useSelector(selectUser);
  const userId = user?.id;
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
          const file = selectedMedia[0];
          media = {
            photoKey: uploadResult[0],
            mediaType: file.type?.startsWith("video") ? "video" : "image",
          };
        }
      } catch (err) {
        console.error("Reply media upload failed", err);
      }
    }

    if (review?.type === 'sharedPost') {
      await dispatch(
        addReplyToSharedPost({
          sharedPostId: review._id,
          commentId: reply._id,
          userId,
          fullName: `${user?.firstName} ${user?.lastName}`,
          commentText: nestedReplyText.trim(),
          ...(media && { media }),
        })
      );
    } else {
      await onAddReply(reply._id, nestedReplyText, media);
    }

    setNestedReplyText('');
    setShowReplyInput(false);
    setNestedReplyInput(false);
    setSelectedMedia([]);
    handleExpandReplies(reply._id);
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
                    : <Image source={{ uri: media?.mediaUrl }} style={styles.image} />
                )}
                <Text style={styles.commentText}>{reply.commentText}</Text>
              </View>
              <View style={styles.likeRow}>
                <LikeButton
                  review={review}
                  reply={reply}
                  userId={userId}
                  postType={postType}
                  placeId={placeId}
                  postId={postId}
                  isPromoOrEvent={isPromoOrEvent}
                  likePromoEventComment={likePromoEventComment}
                />
              </View>
            </View>
          )}
        </View>
        {/* Reply button */}
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
  replyAuthor: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
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
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 6,
    marginTop: 5
  },
});
