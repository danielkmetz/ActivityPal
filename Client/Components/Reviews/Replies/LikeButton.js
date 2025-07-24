import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { toggleCommentLike } from '../../../Slices/ReviewsSlice';
import { toggleLikeOnSharedPostComment } from '../../../Slices/SharedPostsSlice';
import { hasLikedCheck } from '../../../utils/LikeHandlers/hasLikedCheck';
import { findTopLevelCommentId } from '../../../functions';

const LikeButton = ({
  review,
  reply,
  userId,
  postType,
  placeId,
  postId,
  isPromoOrEvent = false,
  likePromoEventComment,
}) => {
  const dispatch = useDispatch();
  const likes = reply?.likes || [];
  const hasLiked = hasLikedCheck(likes, userId);

  const handleToggleLike = () => {
    const topLevelCommentId = findTopLevelCommentId(review.comments, reply._id);

    if (isPromoOrEvent) {
      likePromoEventComment(reply._id);
      return;
    }

    if (review?.type === 'sharedPost') {
      dispatch(toggleLikeOnSharedPostComment({
        sharedPostId: review._id,
        commentId: reply._id,
        userId,
      }));
    } else {
      dispatch(toggleCommentLike({
        postType,
        placeId,
        postId,
        commentId: topLevelCommentId,
        replyId: reply._id,
        userId,
      }));
    }
  };

  return (
    <TouchableOpacity onPress={handleToggleLike} style={styles.likeButton}>
      <MaterialCommunityIcons
        name={hasLiked ? "thumb-up" : "thumb-up-outline"}
        size={16}
        color={hasLiked ? "#009999" : "#999"}
      />
      <Text style={styles.likeCount}>{likes.length || 0}</Text>
    </TouchableOpacity>
  );
};

export default LikeButton;

const styles = StyleSheet.create({
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
