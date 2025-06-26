import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Animated, Easing, PanResponder, InteractionManager, KeyboardAvoidingView, Keyboard, Platform } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
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
import { selectUser } from '../../Slices/UserSlice';
import { formatEventDate, getTimeLeft } from '../../functions';
import { selectReviewById } from '../../utils/reviewSelectors';

dayjs.extend(relativeTime);

export default function CommentScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const {
        reviewId,
        handleLikeWithAnimation,
        toggleTaggedUsers,
        likedAnimations,
        lastTapRef,
        targetId,
        photoTapped,
        isBusinessReview = false,
        isOtherUserReview = false,
        isSuggestedFollowPost = false,
    } = route.params;
    const dispatch = useDispatch();
    const review = useSelector(selectReviewById(reviewId));
    const replyingTo = useSelector(selectReplyingTo);
    const nestedExpandedReplies = useSelector(selectNestedExpandedReplies);
    const isEditing = useSelector(selectIsEditing);
    const nestedReplyInput = useSelector(selectNestedReplyInput);
    const user = useSelector(selectUser);
    const fullName = `${user?.firstName} ${user?.lastName}` || null;
    const userId = user?.id;
    const dateTime = review?.dateTime || review?.date;
    const isInvite = review?.type === "invite";

    const postOwnerPic = isInvite ? review?.sender?.profilePicUrl || review?.profilePicUrl : review?.profilePicUrl;
    const postOwnerName = isInvite && review?.sender?.firstName ? `${review?.sender?.firstName} ${review?.sender?.lastName}` : review?.fullName;
    const totalInvited = review?.recipients?.length || 0;
    const hasTaggedUsers = Array.isArray(review?.taggedUsers) && review.taggedUsers.length > 0;

    const [commentText, setCommentText] = useState('');
    const [keyboardHeight, setKeyboardHeight] = useState(null);
    const [isInputCovered, setIsInputCovered] = useState(false);
    const [timeLeft, setTimeLeft] = useState(getTimeLeft(dateTime));
    const [isPhotoListActive, setIsPhotoListActive] = useState(false);
    const [inputHeight, setInputHeight] = useState(40);
    const [contentHeight, setContentHeight] = useState(40);

    const shiftAnim = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef(null);
    const commentRefs = useRef({});
    const hasScrolledToTarget = useRef(false);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
            const height = e.endCoordinates.height;
            setKeyboardHeight(height);
            setIsInputCovered(true);
            Animated.timing(shiftAnim, {
                toValue: -height + 10,
                duration: 300,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }).start();
        });

        const hideSub = Keyboard.addListener('keyboardWillHide', () => {
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
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    useEffect(() => {
        if (review && isInvite && dateTime) {
            const interval = setInterval(() => setTimeLeft(getTimeLeft(dateTime)), 1000);
            return () => clearInterval(interval);
        }
    }, [dateTime]);

    useEffect(() => {
        setInputHeight(Math.min(Math.max(40, contentHeight), 150));
    }, [contentHeight]);

    const handleAddComment = async () => {
        if (!commentText || !review) return;
        await dispatch(addNewComment({ review, userId, fullName, commentText }));
        dispatch(setReplyingTo(null));
        setCommentText('');
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const waitForRefsAndScroll = (targetId, parentChain) => {
        console.log("🚦 waitForRefsAndScroll triggered with:", { targetId, parentChain });

        InteractionManager.runAfterInteractions(() => {
            console.log("⏳ InteractionManager done");

            setTimeout(() => {
                let attempts = 0;
                const max = 20;

                const interval = setInterval(() => {
                    const flatList = flatListRef.current;
                    const targetNode = commentRefs.current[targetId];

                    console.log(`🔁 [Attempt ${attempts + 1}] Checking refs:`);
                    console.log("   📋 flatListRef.current:", !!flatList);
                    console.log("   📋 commentRefs.current[targetId]:", !!targetNode);

                    if (flatList && targetNode) {
                        console.log("✅ Both flatList and targetNode exist");

                        requestAnimationFrame(() => {
                            try {
                                console.log("🧪 Attempting targetNode.measureLayout");
                                targetNode.measureLayout(
                                    flatList.getNativeScrollRef(),
                                    (x, y) => {
                                        console.log("📍 measureLayout SUCCESS — scroll Y position:", y);
                                        flatList.scrollToOffset({ offset: Math.max(y - 200, 0), animated: true });
                                    },
                                    (err) => {
                                        console.warn("⚠️ measureLayout CALLBACK error:", err);
                                    }
                                );
                            } catch (err) {
                                console.warn("❌ measureLayout THREW error:", err);
                            }
                        });

                        clearInterval(interval);
                    } else if (++attempts >= max) {
                        clearInterval(interval);
                        console.warn("🛑 Max attempts reached, using fallback method");

                        const fallbackIndex = review?.comments?.findIndex(c =>
                            c._id === targetId || c._id === parentChain?.[0]
                        );

                        console.log("🔍 Fallback index:", fallbackIndex);

                        if (fallbackIndex !== -1 && flatList) {
                            console.log("📦 Using fallback scrollToIndex");
                            flatList.scrollToIndex({ index: fallbackIndex, animated: true, viewPosition: 0.5 });
                        } else {
                            console.warn("⚠️ Fallback failed: index not found or flatList is null");
                        }
                    }
                }, 200)
            }, 200); // delay ensures children are mounted
        });
    };

    useFocusEffect(
        React.useCallback(() => {
            console.log("🔁 useFocusEffect START — targetId:", targetId);
            hasScrolledToTarget.current = false;

            if (!targetId || !Array.isArray(review?.comments)) {
                console.warn("⚠️ Invalid targetId or comments not loaded.");
                return;
            }

            const timer = setTimeout(() => {
                console.log("⏲️ Delay passed — starting nested search");
                InteractionManager.runAfterInteractions(() => {
                    console.log("🎯 Running after interactions to search for comment");

                    let found = null;
                    let parentChain = [];

                    const findNested = (comments, targetId, ancestors = []) => {
                        for (const comment of comments) {
                            if (comment._id === targetId) {
                                found = comment;
                                parentChain = [...ancestors];
                                return;
                            }
                            if (comment.replies?.length) {
                                findNested(comment.replies, targetId, [...ancestors, comment._id]);
                            }
                        }
                    };

                    findNested(review.comments, targetId);
                    console.log("🔎 Nested search result — found:", !!found, "parentChain:", parentChain);

                    if (found) {
                        if (parentChain.length > 0) {
                            const expanded = {
                                ...nestedExpandedReplies,
                                ...parentChain.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
                            };
                            console.log("📂 Dispatching expanded reply set:", expanded);
                            dispatch(setNestedExpandedReplies(expanded));
                            dispatch(toggleReplyExpansion(parentChain[0]));
                        }

                        console.log("🚀 Calling waitForRefsAndScroll()");
                        waitForRefsAndScroll(targetId, parentChain);
                        hasScrolledToTarget.current = true;
                    } else {
                        console.warn("❌ Comment not found in nested structure.");
                    }
                });
            }, 400);

            return () => {
                clearTimeout(timer);
                hasScrolledToTarget.current = false;
                commentRefs.current = {};
                console.log("🔚 useFocusEffect CLEANUP");
            };
        }, [review?.comments, targetId])
    );

    if (!review) {
        return null;
    };

    return (
        <Animated.View
            style={[styles.container, { transform: [{ translateY: shiftAnim }] }]}
        >
            <FlatList
                ref={flatListRef}
                data={review?.comments || []}
                keyExtractor={(item, index) => `${review?._id}-${index}`}
                extraData={review?.comments}
                style={styles.comments}
                getItemLayout={(data, index) => ({ length: 100, offset: 100 * index, index })}
                ListHeaderComponent={
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
                        getTimeSincePosted={(date) => dayjs(date).fromNow(true)}
                        onClose={() => navigation.goBack()}
                        setIsPhotoListActive={setIsPhotoListActive}
                    />
                }
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
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
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
