import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import CommentBubble from './CommentBubble';
import CommentActions from './CommentActions';
import CommentOptionsModal from './CommentOptionsModal';
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
import { selectUser } from '../../Slices/UserSlice';

export default function CommentThread({ item, review, commentRefs, commentText, setCommentText }) {
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
  const expandedReplies = useSelector(selectExpandedReplies);
  const nestedExpandedReplies = useSelector(selectNestedExpandedReplies);
  const nestedReplyInput = useSelector(selectNestedReplyInput);
  
  const getTimeSincePosted = (dateString) => dayjs(dateString).fromNow(true);

  const handleAddReply = () => {
    dispatch(addNewReply({
      review,
      replyingTo,
      commentText,
      userId,
      fullName: `${user?.firstName} ${user?.lastName}`,
    }));
    setCommentText('');
  };

  const handleAddNestedReply = (replyId, replyText) => {
    dispatch(addNewNestedReply({
      review,
      parentCommentId: replyId,
      replyText,
      userId,
      fullName: `${user?.firstName} ${user?.lastName}`,
    }));
    dispatch(setReplyingTo(null));
    setCommentText('');
  };

  const handleSaveEdit = () => {
    const selected = selectedReply || selectedComment;
    if (!selected) return;

    dispatch(saveEditedCommentOrReply({
      review,
      selected,
      editedText,
      userId,
    }));
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
    if (!selectedComment && !selectedReply) return;

    dispatch(setIsEditing(true));
    dispatch(setEditedText(selectedReply ? selectedReply.commentText : selectedComment.commentText));
    setOptionsVisible(false);
  };

  return (
    <>
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
              <TextInput
                style={styles.nestedReplyInput}
                placeholder="Write a reply..."
                value={commentText}
                onChangeText={setCommentText}
              />
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
    </>
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
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingHorizontal: 10,
    marginRight: 10,
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
});
