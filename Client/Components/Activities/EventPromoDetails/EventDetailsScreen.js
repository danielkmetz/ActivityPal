import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';
import DetailsHeader from './DetailsHeader';
import EventPromoCommentThread from './EventPromoCommentThread';
import CommentInputFooter from '../../Reviews/CommentINputFooter';
import { eventPromoLikeWithAnimation } from '../../../utils/LikeHandlers/promoEventLikes';
import { leaveEventComment } from '../../../Slices/EventsSlice';
import { leavePromoComment } from '../../../Slices/PromotionsSlice';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { selectUser } from '../../../Slices/UserSlice';
import { selectNearbySuggestionById } from '../../../Slices/GooglePlacesSlice';
import { selectIsEditing, selectNestedReplyInput, selectReplyingTo, setReplyingTo } from '../../../Slices/CommentThreadSlice';
import { useLikeAnimations } from '../../../utils/LikeHandlers/LikeAnimationContext';
import { uploadReviewPhotos } from '../../../Slices/PhotosSlice';
import { selectSelectedPromotion } from '../../../Slices/PromotionsSlice';
import { selectSelectedEvent } from '../../../Slices/EventsSlice';

export default function EventDetailsScreen() {
    const dispatch = useDispatch();
    const { params } = useRoute();
    const { activity } = params;
    const selectedEvent = useSelector(selectSelectedEvent);
    const selectedPromo = useSelector(selectSelectedPromotion);
    const suggestion = useSelector((state) => selectNearbySuggestionById(state, activity?._id));
    const post = selectedEvent || selectedPromo || suggestion;
    const selectedType = activity?.kind?.toLowerCase().includes('event') ? 'event' : 'promo'
    const user = useSelector(selectUser);
    const replyingTo = useSelector(selectReplyingTo);
    const isEditing = useSelector(selectIsEditing);
    const [commentText, setCommentText] = useState('');
    const [inputHeight, setInputHeight] = useState(40);
    const [contentHeight, setContentHeight] = useState(40);
    const [selectedMedia, setSelectedMedia] = useState([]);
    const lastTapRef = useRef({});
    const userId = user?.placeId ? user?.placeId : user?.id;
    const fullName = `${user?.firstName} ${user?.lastName}`;
    const nestedreplyInput = useSelector(selectNestedReplyInput);
    const { getAnimation, registerAnimation } = useLikeAnimations();
    const animation = getAnimation(activity._id);

    const handleAddComment = async () => {
        if ((!commentText || commentText.trim() === '') && (!selectedMedia || selectedMedia.length === 0)) {
            return;
        }

        if (!post) {
            return;
        }

        let media = null;

        if (selectedMedia && selectedMedia.length > 0) {
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
                        mediaType: mediaFile.type.startsWith('video') ? 'video' : 'image',
                    };
                }
            } catch (error) {
                console.error('❌ Media upload failed:', error);
            }
        }

        const commentThunk = selectedType === 'event' ? leaveEventComment : leavePromoComment;

        dispatch(commentThunk({
            placeId: activity.placeId,
            id: activity._id,
            userId,
            fullName,
            commentText,
            ...(media && { media }),
        }));

        setCommentText('');
        setSelectedMedia([]);
        setContentHeight(40);
        dispatch(setReplyingTo(null));
    };

    const handleLikeWithAnimation = (item, force = false) => {
        const animation = getAnimation(item._id);
        return eventPromoLikeWithAnimation({
            type: selectedType,
            postId: item._id,
            item,
            user,
            lastTapRef,
            animation,
            dispatch,
            force,
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
