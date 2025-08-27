import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { hasLikedCheck } from '../../../utils/LikeHandlers/hasLikedCheck';
import { toggleLike as toggleLikeGeneric, toApiPostType } from '../../../Slices/CommentsSlice';

/**
 * Props:
 * - node: the comment or reply object (must have _id, likes[])
 * - userId: current user id (for hasLiked check)
 * - postType: singular app type (e.g. 'review', 'promotion', 'event', 'sharedPost', 'liveStream', ...)
 * - postId: the parent post _id
 * - onToggleLike?: optional override handler (if provided, button calls this instead of dispatching)
 */
const LikeButton = ({
  node,                 // <-- renamed from "reply" to "node" (works for comments or replies)
  userId,
  postType,
  postId,
  onToggleLike,         // optional override
}) => {
  const dispatch = useDispatch();
  const likes = node?.likes || [];
  const hasLiked = hasLikedCheck(likes, userId);

  const handleToggleLike = () => {
    if (typeof onToggleLike === 'function') {
      return onToggleLike();
    }
    const apiPostType = toApiPostType(postType);
    // Pass the node's own id (comment OR reply). The listener figures out ancestry if needed.
    dispatch(
      toggleLikeGeneric({
        postType: apiPostType,
        postId,
        commentId: node._id,
      })
    );
  };

  return (
    <TouchableOpacity onPress={handleToggleLike} style={styles.likeButton}>
      <MaterialCommunityIcons
        name={hasLiked ? 'thumb-up' : 'thumb-up-outline'}
        size={16}
        color={hasLiked ? '#009999' : '#999'}
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
