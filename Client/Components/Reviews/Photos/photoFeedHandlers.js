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
  photoTapped,
  isCommentScreen = false,
  isMyEventsPromosPage = false,
}) {
  const kind = normalizePostType(postContent); // may become 'event' or 'promotion' for suggestion wrappers
  const isSuggestionWrapper = postContent?.type === 'suggestion';

  // IMPORTANT: selectedType should represent STORE/WRAPPER for FullScreen
  const selectedTypeForNav = isSuggestionWrapper ? 'suggestion' : kind;

  // isEventPromo should mean "pull from Events/Promotions slices", NOT "this is event/promo-ish"
  const isEventPromoForNav =
    !isSuggestionWrapper && (kind === 'event' || kind === 'promotion');

  const isEventPromoOrSuggestion = eventPromoDetector(postContent, kind);
  const { isSuggestedFollowPost } = postContent;
  const media = postContent?.photos || postContent?.media;

  const taggedUsersByPhotoKey = Object.fromEntries(
    (media || []).map((photo) => [photo.photoKey, photo.taggedUsers || []])
  );

  const onOpenFullScreen = (photo, index) => {
    navigation.navigate('FullScreenPhoto', {
      reviewId: postContent?._id || postContent?.id,
      initialIndex: index,
      selectedType: selectedTypeForNav,     // ✅ stays 'suggestion' for suggestion wrapper
      suggestionKind: kind,                 // optional: keep the underlying kind if you want it
      isSuggestion: isSuggestionWrapper,    // ✅ explicit, no guessing
      isEventPromo: isEventPromoForNav,     // ✅ only true for real event/promo entities in those slices
      taggedUsersByPhotoKey: taggedUsersByPhotoKey || {},
      isSuggestedPost: isSuggestedFollowPost,
    });
  };

  const toggleOverlay = () => {
    if (typeof setOverlayVisible === 'function') setOverlayVisible((prev) => !prev);
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
