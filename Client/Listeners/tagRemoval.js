import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { removeSelfFromPost, removeSelfFromPhoto } from '../Slices/RemoveTagsSlice';
import { applyPostUpdates as applyReviewUpdates } from '../Slices/ReviewsSlice';
import { applyEventUpdates } from '../Slices/EventsSlice';
import { applyPromotionUpdates } from '../Slices/PromotionsSlice';
import { normalizePostType } from '../utils/normalizePostType';
import { selectUser } from '../Slices/UserSlice';

/* ===== helpers (unchanged) ===== */
const idSetCache = new WeakMap();
const getIdSet = (arr) => {
  if (!Array.isArray(arr)) return null;
  let set = idSetCache.get(arr);
  if (!set) {
    set = new Set(arr.map((p) => String(p?._id)));
    idSetCache.set(arr, set);
  }
  return set;
};
const hasId = (arr, id) => {
  const set = getIdSet(arr);
  return set ? set.has(String(id)) : false;
};
const REVIEW_KEYS = [
  'businessReviews','localReviews','profileReviews','otherUserReviews','userAndFriendsReviews','suggestedPosts'
];
const ALWAYS_REVIEW_KEYS = ['profileReviews', 'userAndFriendsReviews', 'suggestedPosts'];
function computeReviewPostKeys(state, postId) {
  const keys = new Set(ALWAYS_REVIEW_KEYS);
  const rs = state?.reviews || {};
  for (const k of REVIEW_KEYS) if (hasId(rs[k], postId)) keys.add(k);
  return [...keys];
}
function resolveUntagUserId(data, getState) {
  // 1) Prefer what the server returns (most reliable)
  if (data && data.userId) return String(data.userId);

  // 2) Fallback to client state via selector
  const user = selectUser(getState());
  const id = user?.id || user?._id;       // cover both shapes
  return id ? String(id) : null;
}

/* ===== listener ===== */
export const tagRemovalListener = createListenerMiddleware();

tagRemovalListener.startListening({
  matcher: isAnyOf(removeSelfFromPost.fulfilled, removeSelfFromPhoto.fulfilled),
  effect: async (action, api) => {
    const { dispatch, getState } = api;
    const state = getState();

    const { postType, postId, photoId, data } = action.payload || {};
    if (!postType || !postId) {
      return;
    }

    const isPostWide = action.type === removeSelfFromPost.fulfilled.type;
    const userId = resolveUntagUserId(data, getState);
    const type = normalizePostType(postType);

    if (!type) {
      return;
    }

    // Build control updates
    const reviewUpdates = isPostWide
      ? { __removeSelfFromPost: { userId }, __removeSelfFromAllPhotos: { userId } }
      : { __removeSelfFromPhoto: { userId, photoId } };

    const mediaOnlyUpdates = isPostWide
      ? { __removeSelfFromAllPhotos: { userId } }
      : { __removeSelfFromPhoto: { userId, photoId } };

    switch (String(type)) {
      case 'review':
      case 'checkin':
      case 'check-in': {
        const postKeys = computeReviewPostKeys(state, postId);
        dispatch(applyReviewUpdates({ postId, postKeys, updates: reviewUpdates }));
        break;
      }
      case 'event': {
        dispatch(applyEventUpdates({ postId, updates: mediaOnlyUpdates }));
        break;
      }
      case 'promotion': {
        dispatch(applyPromotionUpdates({ postId, updates: mediaOnlyUpdates }));
        break;
      }
      default:
        break;
    }
  },
});
