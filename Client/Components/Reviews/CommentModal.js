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
  Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { addComment, addReply, deleteCommentOrReply, editCommentOrReply } from '../../Slices/ReviewsSlice';
import { useSelector, useDispatch } from 'react-redux';
import { createNotification } from '../../Slices/NotificationsSlice';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Reply from './Reply';
import { formatEventDate, getTimeLeft } from '../../functions';
import CommentModalHeader from './CommentModalHeader';
import CommentOptionsModal from './CommentOptionsModal';
import CommentBubble from './CommentBubble';
import CommentActions from './CommentActions';
import CommentInputFooter from './CommentINputFooter';

dayjs.extend(relativeTime);

function CommentModal({
  visible,
  review,
  onClose,
  setSelectedReview,
  reviews,
  targetId,
  handleLikeWithAnimation,
  toggleTaggedUsers,
  likedAnimations,
  lastTapRef,
  photoTapped,
}) {
  const dispatch = useDispatch();
  const dateTime = review?.dateTime ? review?.dateTime : review?.date;
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [expandedReplies, setExpandedReplies] = useState({});
  const [selectedComment, setSelectedComment] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [selectedReply, setSelectedReply] = useState(null);
  const [isModalVisible, setModalVisible] = useState(false);
  const [nestedReplyInput, setNestedReplyInput] = useState(false)
  const [nestedExpandedReplies, setNestedExpandedReplies] = useState({});
  const [keybaordHeight, setKeyboardHeight] = useState(null)
  const [isInputCovered, setIsInputCovered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(dateTime));
  const slideAnim = useRef(new Animated.Value(300)).current; // Start off-screen to the right
  const shiftAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef(null); // Ref for the FlatList
  const user = useSelector(selectUser);
  const fullName = `${user?.firstName} ${user?.lastName}` || null;
  const userPlaceId = user?.businessDetails?.placeId || null;
  const userId = user?.id;
  const commentRefs = useRef({});
  const [inputHeight, setInputHeight] = useState(40); // Default height 40px
  const [contentHeight, setContentHeight] = useState(40);
  const scrollX = useRef(new Animated.Value(0)).current;
  const postOwnerPic = review?.type === "invite" ? review?.sender?.profilePicUrl
    ? review?.sender?.profilePicUrl
    : review?.profilePicUrl
    : review?.profilePicUrl;
  const postOwnerName =
    review?.type === "invite"
      ? review?.sender?.firstName && review?.sender?.lastName
        ? `${review?.sender?.firstName} ${review?.sender?.lastName}`
        : review?.fullName
      : review?.fullName;
  const totalInvited = review?.recipients?.length || 0;
  const hasTaggedUsers = Array.isArray(review?.taggedUsers) && review.taggedUsers.length > 0;
  const isInvite = review?.type === "invite";

  let reviewOwner;
  if (isInvite) {
    reviewOwner = review.sender?.id || review?.userId;
  } else {
    reviewOwner = review?.userId;
  };

  useEffect(() => {
    if (review && isInvite && dateTime) {
      const interval = setInterval(() => {
        setTimeLeft(getTimeLeft(dateTime));
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [dateTime]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardWillShow', (event) => {
      const keyboardHeight = event.endCoordinates.height;
      setKeyboardHeight(keyboardHeight);
      setIsInputCovered(true);

      Animated.timing(shiftAnim, {
        toValue: -keyboardHeight + 50,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });

    const hideSubscription = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0);
      setIsInputCovered(false);

      Animated.timing(shiftAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    // Find the updated review in Redux state
    const updatedReview = reviews?.find(r => r?._id === review?._id);

    if (updatedReview) {
      setSelectedReview(updatedReview);
    }
  }, [reviews]);

  useEffect(() => {
    setInputHeight(Math.min(Math.max(40, contentHeight), 150)); // Min 40, Max 150
  }, [contentHeight]);

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
    return dayjs(dateString).fromNow(true);
  };

  const toggleReplies = (commentId) => {
    setExpandedReplies((prevState) => ({
      ...prevState,
      [commentId]: !prevState[commentId], // Toggle expanded state
    }));
  };

  const onAddComment = async (postType, postId, text) => {
    if (!text) {
      console.log("❌ onAddComment: No text provided, exiting...");
      return;
    }

    try {
      const response = await dispatch(
        addComment({
          postType,
          placeId: review?.placeId || userPlaceId,
          postId,
          userId,
          fullName,
          commentText: text,
        })
      );

      if (!response.payload || response.payload === "Failed to add comment") {
        console.log("❌ onAddComment: API response payload is invalid:", response.payload);
        return null;
      }

      return response.payload;
    } catch (error) {
      console.error("🚨 onAddComment: Error dispatching addComment:", error);
      return null;
    }
  };

  const handleAddComment = async () => {
    if (!commentText) {
      return;
    };

    if (!review) {
      return;
    };

    const postType = review?.type || "review"; // Default to 'review' if type is missing

    try {
      const newComment = await onAddComment(postType, review._id, commentText);

      if (!newComment) {
        return;
      };

      setReplyingTo(null);
      setCommentText('');

      if (review.userId !== userId && newComment.commentId) {
        await dispatch(
          createNotification({
            userId: reviewOwner,
            type: "comment",
            message: `${fullName} commented on your ${postType}.`,
            relatedId: userId,
            typeRef: "User",
            targetId: review._id,
            commentId: newComment.commentId,
            commentText,
            postType: postType,
          })
        );
      }

      // Scroll to end after adding a comment
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
    } catch (error) {
      console.error("🚨 handleAddComment: Error adding comment:", error);
    }
  };

  const handleAddReply = async () => {
    if (!commentText || !replyingTo) return;

    try {
      const { payload } = await dispatch(
        addReply({
          postType: review.type,
          placeId: review.placeId ? review.placeId : userPlaceId,
          postId: review._id,
          commentId: replyingTo,
          userId,
          fullName,
          commentText,
        })
      );

      if (!payload || !payload.replyId) return;

      // ✅ Expand the comment thread
      setExpandedReplies(prev => ({
        ...prev,
        [replyingTo]: true,
      }));

      // ✅ Reset input fields
      setReplyingTo(null);
      setCommentText('');

      if (!payload.userId || payload.userId === userId) return;

      // ✅ Dispatch notification
      await dispatch(
        createNotification({
          userId: payload.userId,
          type: 'reply',
          message: `${fullName} replied to your ${review.type}.`,
          relatedId: userId,
          typeRef: 'User',
          targetId: review._id,
          commentId: replyingTo,
          replyId: payload.replyId,
          commentText: commentText,
          postType: review.type,
        })
      );
    } catch (error) { }
  };

  const handleAddNestedReply = async (replyId, nestedReplyText) => {
    if (!nestedReplyText || !replyId) {
      return;
    }

    try {
      const { payload } = await dispatch(
        addReply({
          postType: review.type,
          placeId: review.placeId ? review.placeId : userPlaceId,
          postId: review._id,
          commentId: replyId, // The parent reply ID
          userId,
          fullName,
          commentText: nestedReplyText,
        })
      );

      setReplyingTo(null);
      setCommentText('');

      if (!payload || !payload.replyId || !payload.userId || payload.userId === userId) {
        return;
      }

      await dispatch(
        createNotification({
          userId: payload.userId, // Notify the correct parent reply owner
          type: "reply",
          message: `${fullName} replied to your ${review.type}.`,
          relatedId: userId, // The user who replied
          typeRef: "User",
          targetId: review._id, // The review where the reply was added
          commentId: replyId, // The parent comment ID
          replyId: payload.replyId, // The generated reply ID
          commentText: nestedReplyText,
          postType: review.type,
        })
      );
    } catch (error) { }
  };

  const handleReplyButtonClick = (commentId) => {
    setReplyingTo((prevReplyingTo) => (prevReplyingTo === commentId ? null : commentId));
    setCommentText(''); // Clear input when switching between replies
  };

  const handleLongPress = (commentOrReply, isReply = false, parentCommentId = null) => {
    if (!commentOrReply || commentOrReply.userId !== userId) return;

    if (isReply) {
      setSelectedReply({ ...commentOrReply, parentCommentId }); // ✅ Store direct parent ID
      setSelectedComment(null);
    } else {
      setSelectedComment(commentOrReply);
      setSelectedReply(null);
    }

    setModalVisible(true);
  };

  const findParentComment = (comments, targetId) => {
    for (const comment of comments) {
      if (comment._id === targetId) {
        return comment; // ✅ Found parent comment
      }

      if (comment.replies?.length) {
        const found = findParentComment(comment.replies, targetId);
        if (found) return found; // ✅ Found in nested replies
      }
    }
    return null;
  };

  // Handle delete action
  const handleDeleteCommentOrReply = async () => {
    try {
      if (selectedComment) {
        await dispatch(
          deleteCommentOrReply({
            postType: review.type,
            placeId: review.placeId,
            postId: review._id,
            commentId: selectedComment._id,
            relatedId: reviewOwner, // ✅ Use review owner's userId
          })
        );
      }
      else if (selectedReply) {
        if (!selectedReply.parentCommentId || !selectedReply._id) return;

        // **Find the parent comment from `review.comments`**
        const parentComment = findParentComment(review?.comments, selectedReply.parentCommentId);

        if (!parentComment) return;

        await dispatch(
          deleteCommentOrReply({
            postType: review.type,
            placeId: review.placeId,
            postId: review._id,
            commentId: selectedReply._id, // ✅ Reply ID
            relatedId: parentComment.userId, // ✅ Parent comment's userId
          })
        );
      }
    } catch (error) { }

    setModalVisible(false);
    setSelectedComment(null);
    setSelectedReply(null);
  };

  const handleEditComment = () => {
    if (!selectedComment && !selectedReply) return;

    setIsEditing(true);
    setEditedText(selectedReply ? selectedReply.commentText : selectedComment.commentText);
    setModalVisible(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedComment && !selectedReply) return;

    const postType = review.type;
    const isReply = selectedReply !== null;
    const commentId = isReply ? selectedReply._id : selectedComment._id;
    const postId = review._id;
    const placeId = review.placeId;

    try {
      await dispatch(
        editCommentOrReply({
          postType,
          placeId,
          postId,
          commentId,
          userId,
          newText: editedText, // Updated text
        })
      );

      setIsEditing(false);
      setSelectedComment(null);
      setSelectedReply(null);
      setEditedText('');
    } catch (error) {
      console.error("❌ Error updating comment:", error);
    }
  };

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0, // Slide into view
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300, // Slide out to the right
        duration: 300,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        onClose(); // Notify parent after modal fully closes
      });
    }
  }, [visible]);

  useEffect(() => {
    if (visible && targetId && review?.comments) {
      let foundComment = null;
      let parentChain = [];

      // **Recursive function to track only necessary parents**
      const findNestedReply = (comments, targetId, ancestors = []) => {
        for (const comment of comments) {
          if (comment._id === targetId) {
            foundComment = comment;
            parentChain = [...ancestors]; // ✅ Store only real parent chain
            return;
          }

          // ✅ Only add the current comment as a parent if the target is actually inside its replies
          if (comment.replies?.some(reply => reply._id === targetId)) {
            findNestedReply(comment.replies, targetId, [...ancestors, comment._id]);
            return;
          }

          // ✅ Prevent adding unrelated comments by keeping the ancestor list the same for non-parents
          if (comment.replies) {
            findNestedReply(comment.replies, targetId, ancestors);
          }
        }
      };

      findNestedReply(review.comments, targetId);

      if (foundComment) {
        // **Set Expanded States Properly**
        setExpandedReplies(prev => ({
          ...prev,
          [parentChain[0]]: true, // Expand **only** the direct parent comment
        }));

        // **Expand only necessary nested replies**
        if (parentChain.length > 2) {
          // Only expand nested replies if it's deep in the hierarchy
          setNestedExpandedReplies(prev => ({
            ...prev,
            ...parentChain.slice(1).reduce((acc, id) => ({ ...acc, [id]: true }), {}),
          }));
        } else {
          console.log("🚫 Skipping nested replies expansion to avoid unnecessary expansions.");
        }

        // **Ensure scrolling happens after UI update**
        setTimeout(() => {
          if (flatListRef.current && commentRefs.current[targetId]) {
            const targetRef = commentRefs.current[targetId];

            if (targetRef?.measureLayout) {
              targetRef.measureLayout(
                flatListRef.current.getNativeScrollRef(),
                (x, y) => {
                  flatListRef.current.scrollToOffset({
                    offset: Math.max(y - 200, 0), // Adjust for margin
                    animated: true,
                  });
                },
                (error) => {
                  console.warn(`⚠️ Error measuring layout: ${error}`);
                }
              );
            } else {
              console.warn(`⚠️ No valid ref for comment ${targetId}, using scrollToIndex instead.`);

              // **Fallback to scrollToIndex if measureLayout fails**
              setTimeout(() => {
                const topLevelIndex = review.comments.findIndex(c => c._id === parentChain[0]);
                if (topLevelIndex !== -1) {
                  console.log("📜 Fallback: Scrolling to top-level parent at index:", topLevelIndex);
                  flatListRef.current.scrollToIndex({ index: topLevelIndex, animated: true });
                }
              }, 300);
            }
          }
        }, 500);
      } else {
        console.warn("⚠️ Target reply not found in nested comments.");
      }
    }
  }, [visible, targetId, review?.comments]);

  return (
    <Modal transparent visible={visible} animationType="none" avoidKeyboard={true}>
      <Animated.View style={[styles.modalContainer, { transform: [{ translateX: slideAnim }, { translateY: shiftAnim }] }]}>
        <FlatList
          ref={flatListRef} // Attach the ref to the FlatList
          style={styles.comments}
          data={review?.comments || []}
          extraData={review?.comments}
          keyExtractor={(item, index) => `${review?._id}-${index}`}
          getItemLayout={(data, index) => ({
            length: 100, // Approximate height of each comment item
            offset: 100 * index,
            index,
          })}
          ListHeaderComponent={(
            <CommentModalHeader
              review={review}
              isInvite={isInvite}
              hasTaggedUsers={hasTaggedUsers}
              postOwnerPic={postOwnerPic}
              postOwnerName={postOwnerName}
              totalInvited={totalInvited}
              timeLeft={timeLeft}
              dateTime={dateTime}
              formatEventDate={formatEventDate}
              scrollX={scrollX}
              likedAnimations={likedAnimations}
              photoTapped={photoTapped}
              toggleTaggedUsers={toggleTaggedUsers}
              handleLikeWithAnimation={handleLikeWithAnimation}
              lastTapRef={lastTapRef}
              getTimeSincePosted={getTimeSincePosted}
            />
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              onLongPress={() => handleLongPress(item)}
            >
              <View style={styles.commentCard}>
              <CommentBubble
                fullName={item.fullName}
                commentText={item.commentText}
                isEditing={isEditing}
                editedText={editedText}
                setEditedText={setEditedText}
                isSelected={selectedComment?._id === item._id}
              />
                <View style={styles.replyContainer}>
                  <Text style={styles.commentDate}>{getTimeSincePosted(item.date)}</Text>

                  {/* Show Save and Cancel buttons when editing */}
                  <CommentActions
                    isEditing={isEditing}
                    isSelected={selectedComment?._id === item._id}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={() => setIsEditing(false)}
                    onReply={() => handleReplyButtonClick(item._id)}
                    isReplying={replyingTo === item._id}
                  />

                  {/* Nested Replies Toggle */}
                  {item.replies && item.replies.length > 0 && (
                    <TouchableOpacity onPress={() => toggleReplies(item?._id)} style={styles.expandRepliesButton}>
                      <MaterialCommunityIcons
                        name={expandedReplies[item?._id] ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#808080"
                      />
                      <Text style={styles.replyCountText}>{item?.replies?.length} {item?.replies?.length > 1 ? 'replies' : 'reply'}</Text>
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
                {expandedReplies[item?._id] && Array.isArray(item?.replies) && item?.replies?.length > 0 ? (
                  <View style={styles.repliesContainer}>
                    {item?.replies?.map((reply) => (
                      <TouchableOpacity key={reply._id} onLongPress={() => handleLongPress(reply, true)}>
                        <Reply
                          key={reply?._id}
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
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
        {replyingTo === null && !nestedReplyInput && !isEditing && (
          <CommentInputFooter
            commentText={commentText}
            setCommentText={setCommentText}
            handleAddComment={handleAddComment}
            onClose={onClose}
            inputHeight={inputHeight}
            contentHeight={contentHeight}
            setContentHeight={setContentHeight}
          />
        )}
        <CommentOptionsModal
          isVisible={isModalVisible}
          onClose={() => setModalVisible(false)}
          onEdit={handleEditComment}
          onDelete={handleDeleteCommentOrReply}
        />
      </Animated.View>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  commentCard: {
    marginBottom: 5,
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
  closeButton: {
    alignSelf: 'center',
    marginBottom: 30,
  },
  closeButtonText: {
    color: '#009999',
    fontWeight: 'bold',
    fontSize: 16,
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
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
  replyButtonText: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: 'bold',
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
