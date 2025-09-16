import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';
import DetailsHeader from './DetailsHeader';
import EventPromoCommentThread from './EventPromoCommentThread';
import CommentInputFooter from '../../Reviews/CommentINputFooter';
import { handleLikeWithAnimation as sharedHandleLikeWithAnimation } from '../../../utils/LikeHandlers';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { selectUser } from '../../../Slices/UserSlice';
import { selectNearbySuggestionById } from '../../../Slices/GooglePlacesSlice';
import { selectIsEditing, selectNestedReplyInput, selectReplyingTo, setReplyingTo } from '../../../Slices/CommentThreadSlice';
import { useLikeAnimations } from '../../../utils/LikeHandlers/LikeAnimationContext';
import { uploadReviewPhotos } from '../../../Slices/PhotosSlice';
import { selectSelectedPromotion, selectPromotionById } from '../../../Slices/PromotionsSlice';
import { selectEventById, selectSelectedEvent } from '../../../Slices/EventsSlice';
import { typeFromKind, pickPostId } from '../../../utils/posts/postIdentity';
import { addComment, toApiPostType } from '../../../Slices/CommentsSlice';

export default function EventDetailsScreen() {
    const dispatch = useDispatch();
    const { params } = useRoute();
    const { activity } = params;
    const selectedType = activity?.kind?.toLowerCase().includes('event') ? 'event' : 'promo'
    const eventOrPromo = selectedType === ('promo' || 'promotion') ?
        useSelector((state) => selectPromotionById(state, activity?._id)) :
        useSelector((state) => selectEventById(state, activity?._id));
    const selectedEvent = useSelector(selectSelectedEvent);
    const selectedPromo = useSelector(selectSelectedPromotion);
    const suggestion = useSelector((state) => selectNearbySuggestionById(state, activity?._id));
    const post = eventOrPromo || selectedEvent || selectedPromo || suggestion;
    const user = useSelector(selectUser);
    const replyingTo = useSelector(selectReplyingTo);
    const isEditing = useSelector(selectIsEditing);
    const [commentText, setCommentText] = useState('');
    const [selectedMedia, setSelectedMedia] = useState([]);
    const lastTapRef = useRef({});
    const nestedreplyInput = useSelector(selectNestedReplyInput);
    const { getAnimation, registerAnimation } = useLikeAnimations();
    const animation = getAnimation(activity._id);
    const apiPostType = toApiPostType(selectedType);

    const handleAddComment = async () => {
        const hasText = !!commentText?.trim();
        const hasMedia = (selectedMedia?.length || 0) > 0;
        if (!post || (!hasText && !hasMedia)) return;

        let media = null;
        if (hasMedia) {
            const mediaFile = selectedMedia[0];
            try {
                const result = await dispatch(
                    uploadReviewPhotos({
                        placeId: post.placeId,
                        files: [mediaFile],
                    })
                ).unwrap();

                if (result?.length > 0) {
                    media = {
                        photoKey: result[0],
                        mediaType: mediaFile.type?.startsWith('video') ? 'video' : 'image',
                    };
                }
            } catch {
                // non-fatal; continue without media
            }
        }

        try {
            await dispatch(
                addComment({
                    postType: apiPostType,
                    postId: post._id,
                    commentText: commentText.trim(),
                    ...(media && { media }),
                })
            ).unwrap();

            setCommentText('');
            setSelectedMedia([]);
            dispatch(setReplyingTo(null));
        } catch (e) {
            console.error('🚫 Failed to submit comment:', e);
        }
    };

    const handleLikeWithAnimation = (item, force = true) => {
        // Derive type from kind (e.g., "Event", "Promotion", "activeEvent", "upcomingPromo")
        const derivedType =
            (item?.type && String(item.type).toLowerCase()) ||
            typeFromKind(item?.kind) ||
            (item?.__typename && String(item.__typename).toLowerCase());

        const postId = pickPostId(item);
        const animation = getAnimation(postId);

        return sharedHandleLikeWithAnimation({
            postType: derivedType || 'suggestion', // or pass 'event'/'promotion' explicitly if you know it
            kind: item.kind,
            postId,
            review: item,            // ✅ IMPORTANT: shared uses `review`, not `item`
            user,
            animation,
            dispatch,
            lastTapRef,
            force,                   // ✅ we already confirmed double-tap in UI
        });
    };

    useEffect(() => {
        if (post?._id) {
            registerAnimation(post._id);
        }
    }, [post?._id]);

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={{ flex: 1 }}>
                    <KeyboardAwareFlatList
                        extraScrollHeight={20}
                        enableAutomaticScroll
                        data={post?.comments}
                        keyExtractor={(item) => item._id}
                        ListHeaderComponent={
                            <DetailsHeader
                                activity={post}
                                selectedType={selectedType}
                                getTimeSincePosted={(date) => dayjs(date).fromNow(true)}
                                handleLikeWithAnimation={handleLikeWithAnimation}
                                animation={animation}
                                lastTapRef={lastTapRef}
                            />
                        }
                        renderItem={({ item }) => (
                            <View style={{ padding: 16 }}>
                                <EventPromoCommentThread
                                    item={item}
                                    post={post} // Pass the whole post here
                                    commentText={commentText}
                                    setCommentText={setCommentText}
                                    type={selectedType}
                                    selectedMedia={selectedMedia}
                                    setSelectedMedia={setSelectedMedia}
                                />
                            </View>
                        )}
                    />
                    {replyingTo === null && !nestedreplyInput && !isEditing && (
                        <CommentInputFooter
                            commentText={commentText}
                            setCommentText={setCommentText}
                            handleAddComment={handleAddComment}
                            selectedMedia={selectedMedia}
                            setSelectedMedia={setSelectedMedia}
                        />
                    )}
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },

});
