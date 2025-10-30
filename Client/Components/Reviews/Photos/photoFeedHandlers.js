import { logEngagementIfNeeded, getEngagementTarget } from '../../../Slices/EngagementSlice';

/**
 * Factory to build PhotoFeed handlers with injected deps.
 */
export function createPhotoFeedHandlers({
    dispatch,
    navigation,
    postContent,
    onOpenDetails,     // e.g. setDetailsVisible
    photoTapped,       // optional callback from parent
}) {
    const postType = postContent?.type || postContent?.postType;
    const isEventPromoOrSuggestion = postType === 'event' || postType === 'promo' || postType === 'promotion' || postType === 'suggestion';
    const { isSuggestedFollowPost } = postContent;
    const media = postContent?.photos || postContent?.media;

    const taggedUsersByPhotoKey = Object.fromEntries(
        (media || []).map((photo) => [
            photo.photoKey,
            photo.taggedUsers || [],
        ])
    );

    const onOpenFullScreen = (photo, index) => {
        navigation.navigate('FullScreenPhoto', {
            reviewId: postContent?._id,
            initialIndex: index,
            taggedUsersByPhotoKey: taggedUsersByPhotoKey || {},
            isSuggestedPost: isSuggestedFollowPost,
        });
    };

    const openSuggestionDetails = () => {
        if (typeof onOpenDetails === 'function') onOpenDetails(true);
        const { targetType, targetId } = getEngagementTarget(postContent) || {};
        logEngagementIfNeeded(dispatch, {
            targetType,
            targetId,
            placeId: postContent?.placeId,
            engagementType: 'click',
        });
    };

    console.log(isEventPromoOrSuggestion)

    const handlePhotoTap = (photo, index) => {
        if (isEventPromoOrSuggestion) {
            openSuggestionDetails();
        } else {
            onOpenFullScreen(photo, index);
        }
        if (typeof photoTapped === 'function') photoTapped(photo, index);
    };

    return { onOpenFullScreen, openSuggestionDetails, handlePhotoTap };
}
