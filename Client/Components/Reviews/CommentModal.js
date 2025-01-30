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
import { addComment, setLocalReviews, selectLocalReviews, addReply } from '../../Slices/ReviewsSlice';
import { useSelector, useDispatch } from 'react-redux';
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

    console.log(replyingTo)

    
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
                await dispatch(
                    addComment({
                        placeId: review.placeId ? review.placeId : userPlaceId,
                        reviewId,
                        userId,
                        fullName,
                        commentText: text,
                    })
                );
            } catch (error) {
                console.error('Error adding comment:', error);
            }
    };
    
    const handleAddComment = async () => {
        if (!commentText) return;

        // Optimistically update the selected review's comments
        const updatedReview = {
        ...review,
        comments: [...review.comments, { userId: review.userId, commentText, fullName }],
        };

        setSelectedReview(updatedReview); // Update the selected review in real time

        try {
        await onAddComment(review._id, commentText); // Save the comment to the backend
        setCommentText(''); // Clear the input

        // Scroll to the end after adding a comment
        setTimeout(() => {
            if (flatListRef.current) {
            flatListRef.current.scrollToEnd({ animated: true });
            }
        }, 100); // Delay to ensure the comment is rendered
        } catch (error) {
        console.error('Error adding comment:', error);
        }
    };

    const handleAddReply = async () => {
        if (!commentText || !replyingTo) return;

        // Optimistically update the local state
        const updatedReview = {
          ...review,
          comments: review.comments.map((comment) => {
            if (comment._id === replyingTo) {
              return {
                ...comment,
                replies: [...comment.replies, { userId, fullName, commentText, date: new Date() }],
              };
            }
            return comment;
          }),
        };
    
        setSelectedReview(updatedReview);
    
        try {
          await dispatch(
            addReply({
              placeId: review.placeId ? review.placeId : userPlaceId,
              reviewId: review._id,
              commentId: replyingTo,
              userId,
              fullName,
              commentText,
            })
          );
          setCommentText(''); // Clear the input field
          setReplyingTo(null); // Reset replying state
        } catch (error) {
          console.error('Error adding reply:', error);
        }
    };

    const handleAddNestedReply = async (replyId, nestedReplyText) => {
        if (!nestedReplyText || !replyId) {
            console.log('Invalid reply ID or text:', replyId, nestedReplyText);
            return;
        }
    
        const newReply = {
            _id: Date.now(),
            userId,
            fullName,
            commentText: nestedReplyText,
            date: new Date(),
            replies: [],
        };
        
        const addNestedReply = (comments, replyId, newReply) => {
            return comments.map((comment) => {
                console.log('Current comment:', JSON.stringify(comment, null, 2));
                if (comment._id === replyId) {
                    console.log('Match found, adding reply:', newReply);
                    return {
                        ...comment,
                        replies: [...(comment.replies || []), newReply],
                    };
                }
                return {
                    ...comment,
                    replies: addNestedReply(comment.replies || [], replyId, newReply),
                };
            });
        };
        
        const updatedReview = {
            ...review,
            comments: addNestedReply(review.comments, replyId, newReply),
        };

        // Automatically expand the parent comment or reply
        setExpandedReplies((prevState) => ({
            ...prevState,
            [replyId]: true, // Expand the parent to show the new reply
        }));

        setSelectedReview(updatedReview);
    
        try {
            await dispatch(
                addReply({
                    placeId: review.placeId ? review.placeId : userPlaceId,
                    reviewId: review._id,
                    commentId: replyId,
                    userId,
                    fullName,
                    commentText: nestedReplyText,
                })
            );
        } catch (error) {
            console.error('Error adding reply:', error);
        }
    };  
    
    const handleReplyButtonClick = (commentId) => {
      setReplyingTo(prevState => (prevState === commentId ? null : commentId)); 
      setCommentText(''); // Clear the text input when switching replies
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

                        {/* Render replies */}
                        {expandedReplies[item._id] && item.replies && (
                            <View style={styles.repliesContainer}>
                            {item.replies.map((reply) => (
                                <Reply key={reply._id} reply={reply} onAddReply={handleAddNestedReply} getTimeSincePosted={getTimeSincePosted}/>
                            ))}
                            </View>
                        )}
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
