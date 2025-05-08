import React, { useState, } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, TouchableWithoutFeedback} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import {toggleCommentLike} from '../../Slices/ReviewsSlice';
import { findTopLevelCommentId } from '../../functions';
import { setSelectedComment, setSelectedReply } from '../../Slices/CommentThreadSlice';

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
}) => {
  const dispatch = useDispatch();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [nestedReplyText, setNestedReplyText] = useState('');
  const user = useSelector(selectUser);
  const likes = reply?.likes || [];
  const userId = user?.id;

  const hasLiked = Array.isArray(likes) && likes.includes(userId);

  const setNativeRef = (node) => {
    if (node) {
      commentRefs.current[reply._id] = node; // Store native handle
    }
  };

  const handleAddNestedReply = async () => {
    if (!nestedReplyText) return;
    await onAddReply(reply._id, nestedReplyText); // Pass reply ID and text
    setNestedReplyText('');
    setShowReplyInput(false);
    setNestedReplyInput(false);
    handleExpandReplies(reply._id);
  };

  const handleToggleLike = () => {
    const topLevelCommentId = findTopLevelCommentId(review.comments, reply._id);
    if (!topLevelCommentId) return;
  
    dispatch(toggleCommentLike({
      postType,
      placeId,
      postId,
      commentId: topLevelCommentId, // ✅ root-level comment ID
      replyId: reply._id,
      userId,
    }));
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
              <TextInput
                style={styles.editInput}
                value={editedText}
                onChangeText={setEditedText}
                autoFocus={true}
                multiline
              />
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
              <Text style={styles.commentText}>{reply.commentText}</Text>
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
            <TextInput
              style={styles.nestedReplyInput}
              placeholder="Write a reply..."
              value={nestedReplyText}
              onChangeText={setNestedReplyText}
            />
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
    color: '#4caf50',
    fontWeight: 'bold',
  },
  nestedReplyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
  commentButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
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
    backgroundColor: '#4caf50',
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
});
