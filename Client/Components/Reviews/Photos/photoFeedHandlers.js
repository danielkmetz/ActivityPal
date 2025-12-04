import { logEngagementIfNeeded, getEngagementTarget } from '../../../Slices/EngagementSlice';
import { eventPromoDetector } from '../../../utils/EventsPromos/eventPromoDetector';
import { normalizePostType } from '../../../utils/normalizePostType';

/**
 * Factory to build PhotoFeed handlers with injected deps.
 */
export function createPhotoFeedHandlers({
    dispatch,
    navigation,
    postContent,
    setOverlayVisible = () => {},
    photoTapped,       // optional callback from parent
    isCommentScreen=false,
    isMyEventsPromosPage=false,
}) {
    const postType = normalizePostType(postContent);
    const isEventPromoOrSuggestion = eventPromoDetector(postContent, postType);
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
            selectedType: postType,
            taggedUsersByPhotoKey: taggedUsersByPhotoKey || {},
            isSuggestedPost: isSuggestedFollowPost,
            isEventPromo: isEventPromoOrSuggestion,
        });
    };

    const toggleOverlay = () => {
        if (typeof setOverlayVisible === 'function') setOverlayVisible(prev => !prev);
        const { targetType, targetId } = getEngagementTarget(postContent) || {};
        logEngagementIfNeeded(dispatch, {
            targetType,
            targetId,
            placeId: postContent?.placeId,
            engagementType: 'click',
        });
    };

    const handlePhotoTap = (photo, index) => {
        if (isEventPromoOrSuggestion && !isCommentScreen && !isMyEventsPromosPage) {
            toggleOverlay();
        } else {
            onOpenFullScreen(photo, index);
        }
        if (typeof photoTapped === 'function') photoTapped(photo, index);
    };

    return { onOpenFullScreen, toggleOverlay, handlePhotoTap };
}
