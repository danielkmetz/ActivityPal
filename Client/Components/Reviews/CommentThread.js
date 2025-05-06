import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import CommentBubble from './CommentBubble';
import CommentActions from './CommentActions';
import Reply from './Reply';

export default function CommentThread({
  item,
  review,
  userId,
  userPlaceId,
  styles,
  isEditing,
  editedText,
  setEditedText,
  selectedComment,
  setSelectedComment,
  replyingTo,
  commentText,
  setCommentText,
  onSaveEdit,
  onCancelEdit,
  onReply,
  handleAddReply,
  expandedReplies,
  toggleReplies,
  nestedExpandedReplies,
  setNestedExpandedReplies,
  commentRefs,
  setSelectedReply,
  nestedReplyInput,
  setNestedReplyInput,
  handleEditComment,
  handleSaveEdit,
  setIsEditing,
  dispatch,
  toggleCommentLike,
  selectedReply,
  getTimeSincePosted,
  handleAddNestedReply,
  handleLongPress
}) {
  return (
    <TouchableOpacity onLongPress={() => handleLongPress(item)}>
      <View style={styles.commentCard}>
        <CommentBubble
          fullName={item.fullName}
          commentText={item.commentText}
          isEditing={isEditing}
          editedText={editedText}
          setEditedText={setEditedText}
          isSelected={selectedComment?._id === item._id}
          review={review}
          commentId={item._id}
          likes={item.likes}
          userId={userId}
          isReply={false}
          onToggleLike={(commentId) => {
            dispatch(toggleCommentLike({
              postType: review.type,
              placeId: review.placeId || userPlaceId,
              postId: review._id,
              commentId,
              userId,
              replyId: null,
            }));
          }}
        />

        <View style={styles.replyContainer}>
          <Text style={styles.commentDate}>{getTimeSincePosted(item.date)}</Text>

          <CommentActions
            isEditing={isEditing}
            isSelected={selectedComment?._id === item._id}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onReply={() => onReply(item._id)}
            isReplying={replyingTo === item._id}
          />

          {item.replies?.length > 0 && (
            <TouchableOpacity onPress={() => toggleReplies(item._id)} style={styles.expandRepliesButton}>
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

        {expandedReplies[item._id] && Array.isArray(item.replies) && item.replies.length > 0 && (
          <View style={styles.repliesContainer}>
            {item.replies.map((reply) => (
              <TouchableOpacity key={reply._id} onLongPress={() => handleLongPress(reply, true)}>
                <Reply
                  reply={reply}
                  onAddReply={handleAddNestedReply}
                  getTimeSincePosted={getTimeSincePosted}
                  nestedExpandedReplies={nestedExpandedReplies}
                  setNestedExpandedReplies={setNestedExpandedReplies}
                  commentRefs={commentRefs}
                  handleLongPress={handleLongPress}
                  setSelectedReply={setSelectedReply}
                  setSelectedComment={setSelectedComment}
                  parentCommentId={item._id}
                  nestedReplyInput={nestedReplyInput}
                  setNestedReplyInput={setNestedReplyInput}
                  handleEditComment={handleEditComment}
                  handleSaveEdit={handleSaveEdit}
                  setIsEditing={setIsEditing}
                  setEditedText={setEditedText}
                  isEditing={isEditing}
                  editedText={editedText}
                  selectedReply={selectedReply}
                  postType={review?.type}
                  placeId={review?.placeId}
                  postId={review?._id}
                  review={review}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
