import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  FlatList,
  StyleSheet,
  Animated,
  Easing,
  Keyboard,
  PanResponder,
  InteractionManager,
} from 'react-native';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from 'react-redux';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatEventDate, getTimeLeft } from '../../functions';
import CommentModalHeader from './CommentModalHeader';
import CommentInputFooter from './CommentINputFooter';
import CommentThread from './CommentThread';
import {
  selectReplyingTo,
  setReplyingTo,
  toggleReplyExpansion,
  setNestedExpandedReplies,
  selectIsEditing,
  selectNestedReplyInput,
  selectNestedExpandedReplies,
  addNewComment,
} from '../../Slices/CommentThreadSlice';

dayjs.extend(relativeTime);

function CommentModal({
  visible,
  onClose,
  review,
  setSelectedReview,
  reviews,
  handleLikeWithAnimation,
  toggleTaggedUsers,
  likedAnimations,
  lastTapRef,
  targetId,
  photoTapped,
}) {
  const dispatch = useDispatch();
  const replyingTo = useSelector(selectReplyingTo);
  const nestedExpandedReplies = useSelector(selectNestedExpandedReplies);
  const isEditing = useSelector(selectIsEditing);
  const nestedReplyInput = useSelector(selectNestedReplyInput);
  const dateTime = review?.dateTime ? review?.dateTime : review?.date;
  const [commentText, setCommentText] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(null)
  const [isInputCovered, setIsInputCovered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(dateTime));
  const [isPhotoListActive, setIsPhotoListActive] = useState(false);
  const shiftAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef(null); // Ref for the FlatList
  const user = useSelector(selectUser);
  const fullName = `${user?.firstName} ${user?.lastName}` || null;
  const userId = user?.id;
  const commentRefs = useRef({});
  const [inputHeight, setInputHeight] = useState(40); // Default height 40px
  const [contentHeight, setContentHeight] = useState(40);
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
  const panX = useRef(new Animated.Value(0)).current;        // COMMITTED motion
  const previewX = useRef(new Animated.Value(0)).current;    // GESTURE-only preview

  let reviewOwner;
  if (isInvite) {
    reviewOwner = review.sender?.id || review?.userId;
  } else {
    reviewOwner = review?.userId;
  };

  useEffect(() => {
    if (visible) {
      panX.setValue(500); // Move off-screen BEFORE the modal is visible

      InteractionManager.runAfterInteractions(() => {
        Animated.timing(panX, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 10 && Math.abs(dy) < 10 && !isPhotoListActive
      },

      onPanResponderMove: (_, gestureState) => {
        const { dx } = gestureState;

        // Apply gesture to preview ONLY
        if (dx > 0) {
          previewX.setValue(dx);
        } else {
          previewX.setValue(0);
        }
      },

      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx } = gestureState;
        const fastEnough = vx > 2.7;
        const farEnough = dx > 150;

        if (fastEnough || farEnough) {
          Animated.timing(panX, {
            toValue: 500,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            onClose();
          });
        } else {
          Animated.timing(previewX, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }).start();
        }
      }
    })
  ).current;

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

  const handleAddComment = async () => {
    if (!commentText || !review) return;

    await dispatch(addNewComment({ review, userId, fullName, commentText }));

    dispatch(setReplyingTo(null));
    setCommentText('');

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
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

  const handleBackPress = () => {
    panX.setValue(0); // reset for next time

    Animated.timing(panX, {
      toValue: 500, // slide out to the right
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  const waitForRefsAndScroll = (targetId, parentChain) => {
    InteractionManager.runAfterInteractions(() => {
      let attempts = 0;
      const maxAttempts = 15;
      const intervalMs = 200;

      const tryScroll = () => {
        const flatList = flatListRef.current;
        const targetRef = commentRefs.current[targetId];

        if (flatList && targetRef?.measureLayout) {
          targetRef.measureLayout(
            flatList.getNativeScrollRef(),
            (x, y) => {
              flatList.scrollToOffset({
                offset: Math.max(y - 200, 0),
                animated: true,
              });
            },
            (err) => console.warn("⚠️ measureLayout error:", err)
          );
          return true;
        }

        return false;
      };

      const interval = setInterval(() => {
        attempts++;

        if (tryScroll()) {
          clearInterval(interval);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);

          // Fallback
          const fallbackIndex = review?.comments?.findIndex(c => c._id === parentChain[0]);
          if (fallbackIndex !== -1 && flatListRef.current) {
            flatListRef.current.scrollToIndex({
              index: fallbackIndex,
              animated: true,
              viewPosition: 0.5,
            });
          }
        }
      }, intervalMs);
    });
  };

  const hasScrolledToTarget = useRef(false);

  useEffect(() => {
    if (!visible || !targetId || !Array.isArray(review?.comments)) return;

    // Prevent re-dispatching for same target
    if (hasScrolledToTarget.current) return;

    InteractionManager.runAfterInteractions(() => {
      let foundComment = null;
      let parentChain = [];

      const findNestedReply = (comments, targetId, ancestors = []) => {
        for (const comment of comments) {
          if (comment._id === targetId) {
            foundComment = comment;
            parentChain = [...ancestors];
            return;
          }

          if (comment.replies?.some(reply => reply._id === targetId)) {
            findNestedReply(comment.replies, targetId, [...ancestors, comment._id]);
            return;
          }

          if (comment.replies) {
            findNestedReply(comment.replies, targetId, ancestors);
          }
        }
      };

      findNestedReply(review.comments, targetId);

      if (foundComment) {
        if (parentChain.length > 0) {
          const expandedNested = {
            ...nestedExpandedReplies,
            ...parentChain.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
          };
          dispatch(setNestedExpandedReplies(expandedNested));
          dispatch(toggleReplyExpansion(parentChain[0]));
        }

        waitForRefsAndScroll(targetId, parentChain);
        hasScrolledToTarget.current = true;
      }
    });
  }, [visible, targetId, review?.comments]);

  // Reset tracker when modal closes or ID changes
  useEffect(() => {
    if (!visible) {
      hasScrolledToTarget.current = false;
    }
  }, [visible, targetId]);

  return (
    <Modal transparent={true} visible={visible} animationType="none" avoidKeyboard={true} backdropTransitionOutTiming={0}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.modalContainer,
          { transform: [{ translateX: panX }, { translateY: shiftAnim }] }
        ]}
      >
        <FlatList
          ref={flatListRef} // Attach the ref to the FlatList
          style={styles.comments}
          data={review?.comments || []}
          bounce={false}
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
              likedAnimations={likedAnimations}
              photoTapped={photoTapped}
              toggleTaggedUsers={toggleTaggedUsers}
              handleLikeWithAnimation={handleLikeWithAnimation}
              lastTapRef={lastTapRef}
              getTimeSincePosted={getTimeSincePosted}
              onClose={handleBackPress}
              setIsPhotoListActive={setIsPhotoListActive}
            />
          )}
          renderItem={({ item }) => (
            <CommentThread
              item={item}
              review={review}
              commentRefs={commentRefs}
              styles={styles}
              commentText={commentText}
              setCommentText={setCommentText}
            />
          )}
        />
        {replyingTo === null && !nestedReplyInput && !isEditing && (
          <CommentInputFooter
            commentText={commentText}
            setCommentText={setCommentText}
            handleAddComment={handleAddComment}
            inputHeight={inputHeight}
            contentHeight={contentHeight}
            setContentHeight={setContentHeight}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

export default CommentModal;

const styles = StyleSheet.create({
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
  comments: {
    flex: 1,
  },
});
