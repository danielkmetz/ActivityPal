import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg'
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { addComment, addReply } from '../../Slices/ReviewsSlice';
import { useSelector, useDispatch } from 'react-redux';
import { createNotification } from '../../Slices/NotificationsSlice';
import { Avatar } from '@rneui/themed';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Reply from './Reply';

dayjs.extend(relativeTime);

function CommentModal({ visible, review, onClose, setSelectedReview, reviews }) {
    const dispatch = useDispatch();
    const [commentText, setCommentText] = useState('');
    const [replyingTo, setReplyingTo] = useState(null);
    const [expandedReplies, setExpandedReplies] = useState({});
    const slideAnim = useRef(new Animated.Value(300)).current; // Start off-screen to the right
    const flatListRef = useRef(null); // Ref for the FlatList
    const user = useSelector(selectUser);
    const fullName = `${user?.firstName} ${user?.lastName}` || null;
    const userPlaceId = user?.businessDetails?.placeId || null;
    const userId = user?.id;
    const businessReviews = user?.businessDetails?.reviews || [];

    useEffect(() => {
      // Find the updated review in Redux state
      const updatedReview = reviews.find(r => r._id === review._id);
  
      if (updatedReview) {
          setSelectedReview(updatedReview);
      }
    }, [reviews]);
  

    const findCommentOrReply = (comments, targetId) => {
      for (const comment of comments) {
          if (comment._id === targetId) return comment;
          if (comment.replies && comment.replies.length > 0) {
              const nestedReply = findCommentOrReply(comment.replies, targetId);
              if (nestedReply) return nestedReply;
          }
      }
      return null;
    };

    const getTimeSincePosted = (dateString) => {
        return dayjs(dateString).fromNow();
    };
    
    const toggleReplies = (commentId) => {
        setExpandedReplies((prevState) => ({
          ...prevState,
          [commentId]: !prevState[commentId], // Toggle expanded state
        }));
    };
    
    const onAddComment = async (reviewId, text) => {
      if (!text) return;
  
      try {
          const response = await dispatch(
              addComment({
                  placeId: review.placeId ? review.placeId : userPlaceId,
                  reviewId,
                  userId,
                  fullName,
                  commentText: text,
              })
          );
  
          if (!response.payload || response.payload === "Failed to add comment") {
              return null;
          }
  
          return response.payload;
      } catch (error) {
          return null;
      }
    };
  
    const handleAddComment = async () => {
      if (!commentText) return;
  
      // Optimistically update the selected review's comments
      const updatedReview = {
          ...review,
          comments: [...review.comments, { userId, fullName, commentText }],
      };
  
      setSelectedReview(updatedReview);
  
      try {
          // Wait for backend to generate `commentId`
          const newComment = await onAddComment(review._id, commentText);
          if (!newComment) return;
  
          setCommentText(''); // Clear input field
  
          // Scroll to end after adding a comment
          setTimeout(() => {
              if (flatListRef.current) {
                  flatListRef.current.scrollToEnd({ animated: true });
              }
          }, 100);
  
          if (review.userId !== userId && newComment.commentId) {
              await dispatch(
                  createNotification({
                      userId: review.userId,
                      type: 'comment',
                      message: `${fullName} commented on your review.`,
                      relatedId: userId,
                      typeRef: 'User',
                      targetId: review._id,
                      commentId: newComment.commentId,
                  })
              );
          }
      } catch (error) {}
    };
  
    const handleAddReply = async () => {
      if (!commentText || !replyingTo) {
          return;
      }
  
      setSelectedReview(updatedReview);
  
      try {
          const { payload } = await dispatch(
              addReply({
                  placeId: review.placeId ? review.placeId : userPlaceId,
                  reviewId: review._id,
                  commentId: replyingTo,
                  userId,
                  fullName,
                  commentText,
              })
          );
  
          if (!payload || !payload.replyId) {
              return;
          }

          setCommentText('');
  
          // Dispatch notification
          await dispatch(
              createNotification({
                  userId: payload.userId,
                  type: 'reply',
                  message: `${fullName} replied to your comment.`,
                  relatedId: userId,
                  typeRef: 'User',
                  targetId: review._id,
                  commentId: replyingTo,
                  replyId: payload.replyId,
              })
          );
      } catch (error) {}
    };
  
    //console.log(review.comments);
    const handleAddNestedReply = async (replyId, nestedReplyText) => {
      if (!nestedReplyText || !replyId) {
          return;
      }
      console.log(replyId)
      try {
          const { payload } = await dispatch(
              addReply({
                  placeId: review.placeId ? review.placeId : userPlaceId,
                  reviewId: review._id,
                  commentId: replyId, // The parent reply ID
                  userId,
                  fullName,
                  commentText: nestedReplyText,
              })
          );
  
          if (!payload || !payload.replyId || !payload.userId || payload.userId === userId) {
              return;
          }
          console.log(payload.commentId)
          await dispatch(
              createNotification({
                  userId: payload.userId, // Notify the correct parent reply owner
                  type: "reply",
                  message: `${fullName} replied to your comment.`,
                  relatedId: userId, // The user who replied
                  typeRef: "User",
                  targetId: review._id, // The review where the reply was added
                  commentId: replyId, // The parent comment ID
                  replyId: payload.replyId, // The generated reply ID
              })
          );
      } catch (error) {}
    };
  
    const handleReplyButtonClick = (commentId) => {
      setReplyingTo((prevReplyingTo) => (prevReplyingTo === commentId ? null : commentId));
      setCommentText(''); // Clear input when switching between replies
    };
  
    useEffect(() => {
        if (visible) {
        Animated.timing(slideAnim, {
            toValue: 0, // Slide into view
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
        }).start();
        } else {
        Animated.timing(slideAnim, {
            toValue: 300, // Slide out to the right
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: false,
        }).start(() => {
            onClose(); // Notify parent after modal fully closes
        });
        }
    }, [visible]);
    
    return (
        <Modal transparent visible={visible} animationType="none">
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
        >
            <View style={styles.overlay}>
            <Animated.View style={[styles.modalContainer, { transform: [{ translateX: slideAnim }] }]}>
                <View style={styles.header}>
                <View style={styles.userInfo}>
                    <Avatar
                        size={48}
                        rounded
                        source={review.profilePicUrl ? { uri: review.profilePicUrl } : profilePicPlaceholder} // Show image if avatarUrl exists
                        icon={!review.avatarUrl ? { name: 'person', type: 'material', color: '#fff' } : null} // Show icon if no avatarUrl
                        containerStyle={{ backgroundColor: '#ccc' }} // Set background color for the generic avatar
                    />
                    <Text style={styles.reviewerName}>{review.fullName}</Text>
                </View>
                <Text style={styles.reviewText}>{review.reviewText}</Text>
                <Text>{getTimeSincePosted(review.date)}</Text>
                </View>
                <FlatList
                    ref={flatListRef} // Attach the ref to the FlatList
                    style={styles.comments}
                    data={review.comments || []}
                    extraData={review.comments}
                    keyExtractor={(item, index) => `${review._id}-${index}`}
                    renderItem={({ item }) => (
                        <View style={styles.commentCard}>
                        <Text style={styles.commentAuthor}>{item.fullName}:</Text>
                        <Text style={styles.commentText}>{item.commentText}</Text>
                        <Text style={styles.commentDate}>{getTimeSincePosted(item.date)}</Text>

                        <View style={styles.replyContainer}>

                        {/* Reply Button */}
                        <TouchableOpacity
                            onPress={() => handleReplyButtonClick(item._id)}
                            style={styles.replyButton}
                        >
                            <MaterialCommunityIcons name="comment-outline" size={20} color="#808080" />
                            <Text style={styles.replyButtonText}>
                                {replyingTo === item._id ? 'Cancel' : 'Reply'}
                            </Text>
                        </TouchableOpacity>

                        {/* Nested Replies Toggle */}
                        {item.replies && item.replies.length > 0 && (
                            <TouchableOpacity onPress={() => toggleReplies(item._id)} style={styles.expandRepliesButton}>
                            <MaterialCommunityIcons
                                name={expandedReplies[item._id] ? 'chevron-up' : 'chevron-down'}
                                size={20}
                                color="#808080"
                            />
                            <Text style={styles.replyCountText}>{item.replies.length} {item.replies.length > 1 ? 'replies' : 'reply'}</Text>
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

                        {/* Render replies safely */}
                        {expandedReplies[item._id] && Array.isArray(item.replies) && item.replies.length > 0 ? (
                            <View style={styles.repliesContainer}>
                                {item.replies.map((reply) => (
                                    <Reply 
                                        key={reply._id} 
                                        reply={reply} 
                                        onAddReply={handleAddNestedReply} 
                                        getTimeSincePosted={getTimeSincePosted}
                                    />
                                ))}
                            </View>
                        ) : null}
                        </View>
                    )}
                />
                {replyingTo !== null ? null : (
                    <>
                    <View style={styles.commentInputContainer}>
                    <TextInput
                        style={styles.commentInput}
                        placeholder={'Write a comment...'}
                        value={commentText}
                        onChangeText={setCommentText}
                    />
                    <TouchableOpacity
                        style={styles.commentButton}
                        onPress={handleAddComment}
                    >
                        <Text style={styles.commentButtonText}>{'Post'}</Text>
                    </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>Close</Text>
                    </TouchableOpacity>
                    </>
                )}
            </Animated.View>
            </View>
        </KeyboardAvoidingView>
        </Modal>
    );
}

export default CommentModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    justifyContent: 'center',
    marginTop: 55,
  },
  reviewerName: {
    fontSize: 16,
    marginBottom: 10,
    marginLeft: 10,
  },
  reviewText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  comments: {
    marginTop: 180,
  },
  commentCard: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  commentText: {
    fontSize: 12,
    color: '#555',
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  commentInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingHorizontal: 10,
  },
  commentButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  commentDate: {
    fontSize: 12,
    color: '#777',
    marginBottom: 5,
  },
  commentButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  closeButton: {
    marginTop: 20,
    alignSelf: 'center',
  },
  closeButtonText: {
    color: '#4caf50',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nestedReplyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
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
  replyButtonText: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: 'bold',
  },
  replyContainer: {
    flexDirection: 'row',
    marginTop: 5,
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
