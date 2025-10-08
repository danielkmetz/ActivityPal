import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Animated, Easing, InteractionManager, Keyboard } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useFocusEffect, useRoute } from '@react-navigation/native';
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
} from '../../Slices/CommentThreadSlice';
import { selectUser } from '../../Slices/UserSlice';
import { formatEventDate, getTimeLeft } from '../../functions';
import { uploadReviewPhotos } from '../../Slices/PhotosSlice';
import { useLikeAnimations } from '../../utils/LikeHandlers/LikeAnimationContext';
import { handleLikeWithAnimation as sharedHandleLikeWithAnimation } from '../../utils/LikeHandlers';
import { addComment as addCommentGeneric, toApiPostType } from '../../Slices/CommentsSlice';
import { selectPostById } from '../../Slices/ReviewsSlice';
import ShareOptionsModal from './SharedPosts/ShareOptionsModal';
import SharePostModal from './SharedPosts/SharePostModal';
import { medium } from '../../utils/Haptics/haptics';
import { useNavigation } from '@react-navigation/native';

dayjs.extend(relativeTime);

export default function CommentScreen() {
    const route = useRoute();
    const {
        reviewId,
        toggleTaggedUsers,
        targetId,
        photoTapped,
        sharedPost, // can still pass to header/UI if it changes look/feel
    } = route.params || {};
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const review = useSelector((state) => selectPostById(state, reviewId));
    const isSharedPost = !!(
        sharedPost ||            // route flag
        review?.original ||      // backend returned nested original
        review?.type === 'sharedPost' ||  // canonical type
        review?.postType === 'sharedPost' // (in case you stored it this way)
    );
    const replyingTo = useSelector(selectReplyingTo);
    const nestedExpandedReplies = useSelector(selectNestedExpandedReplies);
    const isEditing = useSelector(selectIsEditing);
    const nestedReplyInput = useSelector(selectNestedReplyInput);
    const user = useSelector(selectUser);
    const dateTime = review?.dateTime || review?.date;
    const isInvite = review?.type === 'invite';

    const [commentText, setCommentText] = useState('');
    const [keyboardHeight, setKeyboardHeight] = useState(null);
    const [isInputCovered, setIsInputCovered] = useState(false);
    const [timeLeft, setTimeLeft] = useState(getTimeLeft(dateTime));
    const [isPhotoListActive, setIsPhotoListActive] = useState(false);
    const [inputHeight, setInputHeight] = useState(40);
    const [contentHeight, setContentHeight] = useState(40);
    const [selectedMedia, setSelectedMedia] = useState([]);
    const [shareOptions, setShareOptions] = useState(false);
    const [shareToFeedVisible, setShareToFeedVisible] = useState(false);
    const [selectedPostForShare, setSelectedPostForShare] = useState(null);
    const [editingSharedPost, setEditingSharedPost] = useState(false);

    const { registerAnimation, getAnimation } = useLikeAnimations();
    const shiftAnim = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef(null);
    const commentRefs = useRef({});
    const lastTapRef = useRef({});
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
    }, [review, isInvite, dateTime]);

    useEffect(() => {
        setInputHeight(Math.min(Math.max(40, contentHeight), 150));
    }, [contentHeight]);

    const openShareOptions = (post) => {
        setSelectedPostForShare(post);
        setShareOptions(true);
        medium();
    };

    const closeShareOptions = () => {
        setShareOptions(false);
    };

    const openShareToFeedModal = () => {
        setShareOptions(false);
        setShareToFeedVisible(true);
    };

    const closeShareToFeed = () => {
        setShareToFeedVisible(false);
        setSelectedPostForShare(null);
    };

    const handleLikeWithAnimation = (_ignored, force) => {
        const animation = getAnimation(review._id);
        return sharedHandleLikeWithAnimation({
            postType: review.type,
            postId: review._id,
            review,
            user,
            animation,
            dispatch,
            lastTapRef,
            force,
        });
    };

    const handleShareToStory = () => {
        setShareOptions(false);

        navigation.navigate('StoryPreview', {
            post: selectedPostForShare,
        })
    };

    // ✅ Centralized "add comment" with deep logging
    const handleAddComment = async () => {
        const TAG = '[addCommentGeneric]';
        const t0 = Date.now();

        try {
            // --------- INPUT SUMMARY ---------
            const hasText = !!commentText?.trim();
            const hasMedia = (selectedMedia?.length || 0) > 0;

            const apiPostType = toApiPostType(review?.type);
            console.log(`${TAG} INPUT`, {
                reviewId: review?._id,
                reviewType: review?.type,
                apiPostType,
                hasText,
                hasMedia,
                textLen: (commentText || '').length,
                selectedMediaCount: selectedMedia?.length || 0,
                // a very light peek at the first media (avoid dumping large blobs)
                firstMedia: selectedMedia?.[0]
                    ? {
                        name: selectedMedia[0]?.fileName || selectedMedia[0]?.name || null,
                        type: selectedMedia[0]?.type || null,
                        size: selectedMedia[0]?.fileSize || selectedMedia[0]?.size || null,
                        hasUri: !!selectedMedia[0]?.uri,
                        hasPhotoKey: !!selectedMedia[0]?.photoKey,
                    }
                    : null,
            });

            // --------- GUARDS ---------
            if (!review) {
                console.warn(`${TAG} ABORT: review missing`);
                return;
            }
            if (!apiPostType) {
                console.warn(`${TAG} ABORT: toApiPostType returned falsy`, { sourceType: review?.type });
                return;
            }
            if (!hasText && !hasMedia) {
                console.warn(`${TAG} ABORT: neither text nor media present`);
                return;
            }

            // --------- MEDIA UPLOAD (optional) ---------
            let media = null;
            if (hasMedia) {
                const mediaFile = selectedMedia[0];
                const mStart = Date.now();

                console.log(`${TAG} media: dispatch(uploadReviewPhotos) start`, {
                    placeId: review.placeId || null,
                    kind: mediaFile?.type,
                });

                let uploadAction;
                try {
                    uploadAction = await dispatch(
                        uploadReviewPhotos({
                            placeId: review.placeId, // ok if undefined for some post types
                            files: [mediaFile],
                        })
                    );

                    if (uploadReviewPhotos.fulfilled.match(uploadAction)) {
                        const result = uploadAction.payload;
                        console.log(`${TAG} media: upload fulfilled`, {
                            ms: Date.now() - mStart,
                            resultLen: Array.isArray(result) ? result.length : null,
                            firstKey: Array.isArray(result) ? result[0] : null,
                        });

                        if (Array.isArray(result) && result.length > 0) {
                            media = {
                                photoKey: result[0],
                                mediaType: mediaFile?.type?.startsWith('video') ? 'video' : 'image',
                            };
                        }
                    } else {
                        console.warn(`${TAG} media: upload rejected`, {
                            ms: Date.now() - mStart,
                            error: uploadAction.error,
                            payload: uploadAction.payload,
                        });
                    }
                } catch (e) {
                    console.error(`${TAG} media: upload threw`, {
                        ms: Date.now() - mStart,
                        message: e?.message,
                        stack: e?.stack,
                    });
                }
            }

            // --------- BUILD PAYLOAD ---------
            const payload = {
                postType: apiPostType,
                postId: review._id,
                commentText: (commentText || '').trim(),
                ...(media && { media }),
            };

            console.log(`${TAG} dispatch(addCommentGeneric)`, {
                payloadSummary: {
                    postType: payload.postType,
                    postId: payload.postId,
                    commentTextLen: payload.commentText.length,
                    hasMedia: !!payload.media,
                    mediaType: payload.media?.mediaType || null,
                    hasPhotoKey: !!payload.media?.photoKey,
                },
            });

            // --------- DISPATCH THUNK (NO unwrap) ---------
            const action = await dispatch(addCommentGeneric(payload));

            // Inspect result explicitly
            if (addCommentGeneric.fulfilled.match(action)) {
                console.log(`${TAG} fulfilled`, {
                    ms: Date.now() - t0,
                    returned: {
                        postType: action.payload?.postType,
                        postId: action.payload?.postId,
                        hasComment: !!action.payload?.comment,
                        commentId: action.payload?.comment?._id || null,
                    },
                });

                // UI resets
                dispatch(setReplyingTo(null));
                setCommentText('');
                setSelectedMedia([]);

                setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                }, 100);

                return; // success
            }

            // Rejected path
            console.error(`${TAG} rejected`, {
                ms: Date.now() - t0,
                error: action.error,
                payload: action.payload,
                meta: action.meta,
            });
            // bubble up so caller sees failure (matches previous behavior with unwrap)
            throw action.error || new Error('addCommentGeneric rejected');

        } catch (error) {
            console.error(`${TAG} THREW`, {
                ms: Date.now() - t0,
                message: error?.message,
                stack: error?.stack,
            });
        }
    };

    const waitForRefsAndScroll = (targetId, parentChain) => {
        InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
                let attempts = 0;
                const max = 20;

                const interval = setInterval(() => {
                    const flatList = flatListRef.current;
                    const targetNode = commentRefs.current[targetId];

                    if (flatList && targetNode) {
                        requestAnimationFrame(() => {
                            try {
                                targetNode.measureLayout(
                                    flatList.getNativeScrollRef(),
                                    (x, y) => {
                                        flatList.scrollToOffset({ offset: Math.max(y - 200, 0), animated: true });
                                    },
                                    () => { }
                                );
                            } catch { }
                        });
                        clearInterval(interval);
                    } else if (++attempts >= max) {
                        clearInterval(interval);
                        const fallbackIndex = review?.comments?.findIndex(c =>
                            c._id === targetId || c._id === parentChain?.[0]
                        );
                        if (fallbackIndex !== -1 && flatList) {
                            flatList.scrollToIndex({ index: fallbackIndex, animated: true, viewPosition: 0.5 });
                        }
                    }
                }, 200);
            }, 200);
        });
    };

    useFocusEffect(
        React.useCallback(() => {
            hasScrolledToTarget.current = false;

            if (!targetId || !Array.isArray(review?.comments)) return;

            const timer = setTimeout(() => {
                InteractionManager.runAfterInteractions(() => {
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

                    if (found) {
                        if (parentChain.length > 0) {
                            const expanded = {
                                ...nestedExpandedReplies,
                                ...parentChain.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
                            };
                            dispatch(setNestedExpandedReplies(expanded));
                            dispatch(toggleReplyExpansion(parentChain[0]));
                        }
                        waitForRefsAndScroll(targetId, parentChain);
                        hasScrolledToTarget.current = true;
                    }
                });
            }, 400);

            return () => {
                clearTimeout(timer);
                hasScrolledToTarget.current = false;
                commentRefs.current = {};
            };
        }, [review?.comments, targetId, dispatch, nestedExpandedReplies])
    );

    useEffect(() => {
        if (review?._id) registerAnimation(review._id);
    }, [review?._id, registerAnimation]);

    if (!review) return null;

    return (
        <Animated.View style={[styles.container, { transform: [{ translateY: shiftAnim }] }]}>
            <FlatList
                ref={flatListRef}
                data={review?.comments || []}
                keyExtractor={(item) => item?._id || `${review?._id}-${Math.random()}`}
                extraData={review?.comments}
                style={styles.comments}
                getItemLayout={(data, index) => ({ length: 100, offset: 100 * index, index })}
                ListHeaderComponent={
                    <CommentModalHeader
                        review={review}
                        timeLeft={timeLeft}
                        formatEventDate={formatEventDate}
                        photoTapped={photoTapped}
                        toggleTaggedUsers={toggleTaggedUsers}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        lastTapRef={lastTapRef}
                        setIsPhotoListActive={setIsPhotoListActive}
                        sharedPost={isSharedPost}
                        onShare={openShareOptions}
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
                        selectedMedia={selectedMedia}
                        setSelectedMedia={setSelectedMedia}
                        sharedPost={sharedPost}
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
                    selectedMedia={selectedMedia}
                    setSelectedMedia={setSelectedMedia}
                />
            )}
            <SharePostModal
                visible={shareToFeedVisible}
                onClose={closeShareToFeed}
                post={selectedPostForShare}
                isEditing={editingSharedPost}
                setIsEditing={setEditingSharedPost}
            />
            <ShareOptionsModal
                visible={shareOptions}
                onClose={closeShareOptions}
                onShareToFeed={openShareToFeedModal}
                onShareToStory={handleShareToStory}
            />
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
    comments: { flex: 1 },
});
