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
  Image,
  Dimensions,
} from 'react-native';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg'
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { addComment, addReply, deleteCommentOrReply, editCommentOrReply } from '../../Slices/ReviewsSlice';
import { useSelector, useDispatch } from 'react-redux';
import { createNotification } from '../../Slices/NotificationsSlice';
import { Avatar } from '@rneui/themed';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Reply from './Reply';
import ModalBox from 'react-native-modal';

const screenWidth = Dimensions.get("window").width;

dayjs.extend(relativeTime);

function CommentModal({ visible, review, onClose, setSelectedReview, reviews, targetId }) {
  const dispatch = useDispatch();
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
  const inputRef = useRef(null);

  const businessReviews = user?.businessDetails?.reviews || [];

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
    }

    if (!review) {
      return;
    }

    const postType = review?.type || "review"; // Default to 'review' if type is missing

    try {
      const newComment = await onAddComment(postType, review._id, commentText);

      if (!newComment) {
        console.log("❌ handleAddComment: Failed to add comment, rolling back UI update...");
        return;
      }

      if (review.userId !== userId && newComment.commentId) {
        await dispatch(
          createNotification({
            userId: review.userId,
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
            relatedId: review.userId, // ✅ Use review owner's userId
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
          onScrollBeginDrag={() => console.log('📜 FlatList Scrolled')}
          onLayout={() => console.log('📌 FlatList Mounted')}
          onContentSizeChange={(width, height) => console.log('📏 FlatList Content Height:', height)}
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
            <View style={styles.header}>
              <View style={styles.headerText}>
                <View style={styles.userInfo}>
                  <Avatar
                    size={48}
                    rounded
                    source={review?.profilePicUrl ? { uri: review?.profilePicUrl } : profilePicPlaceholder} // Show image if avatarUrl exists
                    icon={!review?.avatarUrl ? { name: 'person', type: 'material', color: '#fff' } : null} // Show icon if no avatarUrl
                    containerStyle={{ backgroundColor: '#ccc' }} // Set background color for the generic avatar
                  />
                  <Text style={styles.reviewerName}>
                    <Text style={styles.fullName}>{review?.fullName}</Text>
                    {review?.type === "check-in" && review?.taggedUsers?.length > 0 && " is with "}
                    {review?.type === "check-in" && Array.isArray(review?.taggedUsers) && review?.taggedUsers.length > 0
                      ? review?.taggedUsers.map((user, index) => (
                        <Text key={user._id} style={styles.taggedUser}>
                          {user.fullName}
                          {index !== review?.taggedUsers.length - 1 ? ", " : ""}
                        </Text>
                      ))
                      : ""}

                    {/* ✅ Force business name to appear on the next line using \n */}
                    {review?.type === "check-in" && (
                      <Text>
                        {" "}
                        at
                        {"\n"} {/* ✅ Forces new line */}
                        <Text style={styles.businessName}>{review.businessName}</Text>
                      </Text>
                    )}
                  </Text>

                </View>
                <Text style={styles.businessName}>
                  {review?.type === "review" ? review?.businessName : ""}
                </Text>

                {/* Dynamically render stars */}
                <View style={styles.rating}>
                  {Array.from({ length: review?.rating }).map((_, index) => (
                    <MaterialCommunityIcons
                      key={index}
                      name="star"
                      size={20}
                      color="gold"
                    />
                  ))}
                </View>
                <Text style={styles.reviewText}>{review?.type === "review" ? review?.reviewText : review?.message}</Text>
              </View>
              {/* ✅ Render Photos (If Available) */}
              {review?.photos?.length > 0 && (
                <View>
                  <FlatList
                    data={review?.photos}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item._id}
                    renderItem={({ item }) => (
                      <Image source={{ uri: item?.url }} style={styles.photo} />
                    )}
                  />
                  {/* Dots Indicator */}
                  <View style={styles.paginationContainer}>
                    {review?.photos.map((_, index) => (
                      <View key={index} style={styles.dot} />
                    ))}
                  </View>
                </View>
              )}
              {review?.type === "check-in" && (
                <Image
                  source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }} // A pin icon URL
                  style={styles.pinIcon}
                />
              )}

              <Text style={styles.reviewDate}>{getTimeSincePosted(review?.date)} ago</Text>
            </View>

          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              onLongPress={() => handleLongPress(item)}
            >
              <View style={styles.commentCard}>
                <View style={styles.commentBubble}>
                  <Text style={styles.commentAuthor}>{item.fullName}:</Text>

                  {/* Show TextInput if editing, otherwise show text */}
                  {isEditing && selectedComment?._id === item._id ? (
                    <TextInput
                      style={styles.editInput}
                      value={editedText}
                      onChangeText={setEditedText}
                      autoFocus={true}
                      multiline
                    />
                  ) : (
                    <Text style={styles.commentText}>{item.commentText}</Text>
                  )}
                </View>

                <View style={styles.replyContainer}>
                  <Text style={styles.commentDate}>{getTimeSincePosted(item.date)}</Text>

                  {/* Show Save and Cancel buttons when editing */}
                  {isEditing && selectedComment?._id === item._id ? (
                    <>
                      <TouchableOpacity onPress={handleSaveEdit} style={styles.saveButton}>
                        <Text style={styles.saveButtonText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.cancelButton}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => handleReplyButtonClick(item._id)} style={styles.replyButton}>
                      <MaterialCommunityIcons name="comment-outline" size={20} color="#808080" />
                      <Text style={styles.replyButtonText}>
                        {replyingTo === item._id ? 'Cancel' : 'Reply'}
                      </Text>
                    </TouchableOpacity>
                  )}

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
                    {item?.replies.map((reply) => (
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
        {(replyingTo === null && !nestedReplyInput && !isEditing) && (
          <>
            <View style={styles.commentInputContainer}>
              <TextInput
                style={[styles.commentInput, { height: inputHeight }]}
                placeholder={'Write a comment...'}
                value={commentText}
                onChangeText={setCommentText}
                multiline={true} // ✅ Enables multiple lines
                textAlignVertical="top" // ✅ Aligns text to top
                onContentSizeChange={(event) => {
                  setContentHeight(event.nativeEvent.contentSize.height);
                }}
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
        <ModalBox
          isVisible={isModalVisible}
          onBackdropPress={() => setModalVisible(false)}
          style={styles.bottomModal}
        >
          <View style={styles.modalContent}>
            <TouchableOpacity onPress={handleEditComment} style={styles.modalButton}>
              <MaterialCommunityIcons name="pencil-outline" size={20} color="black" />
              <Text style={styles.modalButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteCommentOrReply} style={styles.modalButton}>
              <MaterialCommunityIcons name="delete-outline" size={20} color="red" />
              <Text style={styles.modalButtonTextRed}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ModalBox>
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
    //padding: 15,
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
  bottomModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 15,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    alignItems: 'center',
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalButtonText: {
    fontSize: 16,
    marginLeft: 10,
  },
  modalButtonTextRed: {
    fontSize: 16,
    marginLeft: 10,
    color: 'red',
  },
  modalCancelButton: {
    padding: 15,
    width: '100%',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007bff',
  },
  commentCard: {
    marginBottom: 5,
  },
  header: {
    marginTop: 45,
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    justifyContent: 'center',
  },
  headerText: {
    padding: 15,
  },
  reviewerName: {
    flexWrap: 'wrap',
    flexShrink: 1,
    fontSize: 16,
    marginBottom: 10,
    marginLeft: 10,
  },
  businessName: {
    fontSize: 16,
    fontWeight: "bold",
    color: '#555',
  },
  reviewText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  reviewDate: {
    marginLeft: 10,
  },
  commentBubble: {
    backgroundColor: '#f0f2f5',
    padding: 10,
    borderRadius: 15,
    marginVertical: 5,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  commentText: {
    fontSize: 14,
    color: '#555',
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 15,
  },
  commentInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingHorizontal: 10,
    minHeight: 40, // ✅ Minimum height
    //maxHeight: 150,
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
    color: '#4caf50',
    fontWeight: 'bold',
    fontSize: 16,
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
  rating: {
    fontSize: 14,
    flexDirection: 'row',
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
  editInput: {
    backgroundColor: '#f9f9f9',
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 5,
    padding: 8,
    fontSize: 14,
    minHeight: 40,
  },
  saveButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 10,
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
    marginLeft: 10,
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
  },
  photo: {
    width: screenWidth, // Full width of review minus padding
    height: 400, // Larger photo height
    borderRadius: 8,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 5,
  },
  fullName: {
    fontWeight: 'bold'
  },
  taggedUser: {
    fontWeight: 'bold'
  },
  pinIcon: {
    width: 50,
    height: 50,
    alignSelf: 'center',
    marginBottom: 10,
  },

});
