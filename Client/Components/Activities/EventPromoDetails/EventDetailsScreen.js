import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, ActivityIndicator, Text } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';
import DetailsHeader from './DetailsHeader';
import EventPromoCommentThread from './EventPromoCommentThread';
import CommentInputFooter from '../../Reviews/CommentINputFooter'; // <-- fix casing
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { selectNearbySuggestionById } from '../../../Slices/GooglePlacesSlice';
import { selectIsEditing, selectNestedReplyInput, selectReplyingTo, setReplyingTo } from '../../../Slices/CommentThreadSlice';
import { uploadReviewPhotos } from '../../../Slices/PhotosSlice';
import { selectSelectedPromotion, selectPromotionById, fetchPromotionById } from '../../../Slices/PromotionsSlice';
import { selectEventById, selectSelectedEvent, fetchEventById } from '../../../Slices/EventsSlice';
import { addComment, toApiPostType } from '../../../Slices/CommentsSlice';

// ensure this returns 'event' | 'promotion'
import { normalizeActivityType } from '../../../utils/normalizeActivityType';

const LOG_DETAILS = true;
const dlog = (...a) => LOG_DETAILS && console.log('[EventDetails]', ...a);

export default function EventDetailsScreen() {
  const dispatch = useDispatch();
  const { params } = useRoute() || {};
  const activity = params?.activity || {};
  const rawKind = activity?.postType || activity?.kind; // could be plural or singular
  const selectedType = normalizeActivityType(rawKind);   // must return 'event' | 'promotion'
  const activityId   = activity?.postId || activity?._id;

  const isPromo = selectedType === 'promotion';

  const promoById     = useSelector(s => selectPromotionById(s, activityId));
  const eventById     = useSelector(s => selectEventById(s, activityId));
  const selectedEvent = useSelector(selectSelectedEvent);
  const selectedPromo = useSelector(selectSelectedPromotion);
  const suggestion    = useSelector(s => selectNearbySuggestionById(s, activityId));
  const resolvedById  = isPromo ? promoById : eventById;
  const post = resolvedById || selectedEvent || selectedPromo || suggestion;
  const replyingTo   = useSelector(selectReplyingTo);
  const isEditing    = useSelector(selectIsEditing);
  const nestedReply  = useSelector(selectNestedReplyInput);
  const [commentText, setCommentText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState([]);
  const apiPostType = toApiPostType(selectedType); // ensure this returns 'event' or 'promotion'

  // Fetch on mount if missing
  useEffect(() => {
    if (!activityId || !selectedType) return;
    if (!post) {
      if (selectedType === 'event') {
        dispatch(fetchEventById({ eventId: activityId }));
      } else {
        dispatch(fetchPromotionById({ promoId: activityId }));
      }
    }
  }, [dispatch, activityId, selectedType, post]);

  const handleAddComment = async () => {
    const hasText  = !!commentText?.trim();
    const hasMedia = (selectedMedia?.length || 0) > 0;
    if (!post || (!hasText && !hasMedia)) return;

    let media = null;
    if (hasMedia) {
      const mediaFile = selectedMedia[0];
      try {
        const uploaded = await dispatch(
          uploadReviewPhotos({
            placeId: post.placeId || post.business?.placeId, // safer
            files: [mediaFile],
          })
        ).unwrap();
        if (uploaded?.length > 0) {
          media = {
            photoKey: uploaded[0],
            mediaType: mediaFile.type?.startsWith('video') ? 'video' : 'image',
          };
        }
      } catch (err) {
        console.warn('Upload failed; submitting comment without media.', err);
      }
    }

    try {
      await dispatch(
        addComment({
          postType: apiPostType, // 'event' | 'promotion'
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

  // Loading / Not found fallbacks
  if (!post) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  const comments = Array.isArray(post.comments) ? post.comments : [];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          <KeyboardAwareFlatList
            extraScrollHeight={20}
            enableAutomaticScroll
            keyboardShouldPersistTaps="handled"
            data={comments}
            keyExtractor={(item) => item?._id || String(item?.id || Math.random())}
            ListHeaderComponent={
              <DetailsHeader
                activity={post}
                selectedType={selectedType} // 'event' | 'promotion'
                getTimeSincePosted={(date) => dayjs(date).fromNow(true)}
              />
            }
            ListEmptyComponent={
              <View style={{ padding: 16 }}>
                <Text>No comments yet. Be the first!</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={{ padding: 16 }}>
                <EventPromoCommentThread
                  item={item}
                  post={post}
                  commentText={commentText}
                  setCommentText={setCommentText}
                  type={selectedType}
                  selectedMedia={selectedMedia}
                  setSelectedMedia={setSelectedMedia}
                />
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 12 }}
          />
          {replyingTo === null && !nestedReply && !isEditing && (
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
  container: { flex: 1, backgroundColor: '#fff' },
});
