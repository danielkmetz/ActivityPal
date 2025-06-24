import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
import { useRoute } from '@react-navigation/native';
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
import { selectIsEditing, selectNestedExpandedReplies, selectReplyingTo } from '../../../Slices/CommentThreadSlice';

export default function EventDetailsScreen() {
    const dispatch = useDispatch();
    const { params } = useRoute();
    const { activity } = params;
    const suggestion = useSelector((state) => selectNearbySuggestionById(state, activity?._id));
    const selectedType = activity?.kind?.toLowerCase().includes('event') ? 'event' : 'promo'
    const user = useSelector(selectUser);
    const replyingTo = useSelector(selectReplyingTo);
    const nestedReplyInput = useSelector(selectNestedExpandedReplies);
    const isEditing = useSelector(selectIsEditing);
    const [likedAnimations, setLikedAnimations] = useState({});
    const [photoTapped, setPhotoTapped] = useState(null);
    const [commentText, setCommentText] = useState('');
    const [inputHeight, setInputHeight] = useState(40);
    const [contentHeight, setContentHeight] = useState(40);
    const lastTapRef = useRef({});
    const userId = user?.id;
    const fullName = `${user?.firstName} ${user?.lastName}`;

    const handleAddComment = () => {
        if (!commentText.trim()) return;

        const commentThunk = selectedType === 'event' ? leaveEventComment : leavePromoComment;

        dispatch(commentThunk({
            placeId: activity.placeId,
            id: activity._id,
            userId,
            fullName,
            commentText
        }));

        setCommentText('');
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={{ flex: 1 }}>
                    <FlatList
                        data={suggestion?.comments}
                        keyExtractor={(item) => item._id}
                        ListHeaderComponent={
                            <DetailsHeader
                                activity={activity}
                                selectedType={selectedType}
                                getTimeSincePosted={(date) => dayjs(date).fromNow(true)}
                                handleLikeWithAnimation={eventPromoLikeWithAnimation}
                                likedAnimations={likedAnimations}
                                lastTapRef={lastTapRef}
                                photoTapped={photoTapped}
                            />
                        }
                        renderItem={({ item }) => (
                            <View style={{ padding: 16 }}>
                                <EventPromoCommentThread
                                    key={item._id}
                                    item={item}
                                    post={activity} // Pass the whole post here
                                    commentText={commentText}
                                    setCommentText={setCommentText}
                                    type={selectedType}
                                />
                            </View>
                        )}
                    />
                    {/* {replyingTo === null && !nestedReplyInput && !isEditing && ( */}
                        <CommentInputFooter
                            commentText={commentText}
                            setCommentText={setCommentText}
                            handleAddComment={handleAddComment}
                            inputHeight={inputHeight}
                            contentHeight={contentHeight}
                            setContentHeight={setContentHeight}
                        />
                    {/* )} */}
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
