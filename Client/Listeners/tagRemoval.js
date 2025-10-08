// listeners/tagRemovalListener.js
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';

// Thunks that hit /api/remove-tags
import { removeSelfFromPost, removeSelfFromPhoto } from '../Slices/RemoveTagsSlice';

// Per-domain updaters
import { applyPostUpdates as applyReviewUpdates } from '../Slices/ReviewsSlice';
import { applyEventUpdates } from '../Slices/EventsSlice';
import { applyPromotionUpdates } from '../Slices/PromotionsSlice';
import { normalizePostType } from '../utils/normalizePostType';

// Optional: if you expose a check-ins updater, uncomment this:
// import { applyCheckInUpdates } from '../Slices/CheckInsSlice';

/* =========================
   Tiny helpers (reviews)
========================= */

// Fast membership cache for O(1) id checks
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

// Keys where Reviews keep lists; adjust to your state shape if needed
const REVIEW_KEYS = [
    'businessReviews',
    'localReviews',
    'profileReviews',
    'otherUserReviews',
    'userAndFriendsReviews',
    'suggestedPosts',
];
const ALWAYS_REVIEW_KEYS = ['profileReviews', 'userAndFriendsReviews', 'suggestedPosts'];

function computeReviewPostKeys(state, postId) {
    const keys = new Set(ALWAYS_REVIEW_KEYS);
    const rs = state?.reviews || {};
    for (const k of REVIEW_KEYS) {
        if (hasId(rs[k], postId)) keys.add(k);
    }
    return [...keys];
}

function resolveUntagUserId(data, getState) {
    // Prefer server echo; fallback to client auth/user slice
    if (data && data.userId) return String(data.userId);
    const s = getState();
    return String(s?.user?.id || s?.auth?.user?.id || '');
}

/* =========================
   Listener
========================= */

export const tagRemovalListener = createListenerMiddleware();

tagRemovalListener.startListening({
    matcher: isAnyOf(
        removeSelfFromPost.fulfilled,
        removeSelfFromPhoto.fulfilled
    ),
    effect: async (action, api) => {
        const { dispatch, getState } = api;
        const state = getState();

        const { postType, postId, photoId, data } = action.payload || {};
        if (!postType || !postId) return;

        const userId = resolveUntagUserId(data, getState);
        const isPostWide = action.type === removeSelfFromPost.fulfilled.type;

        // Build control updates for updatePostCollections helper
        const reviewUpdates = isPostWide
            ? {
                __removeSelfFromPost: { userId },
                __removeSelfFromAllPhotos: { userId },
            }
            : {
                __removeSelfFromPhoto: { userId, photoId },
            };

        const mediaOnlyUpdates = isPostWide
            ? { __removeSelfFromAllPhotos: { userId } }
            : { __removeSelfFromPhoto: { userId, photoId } };

        const type = normalizePostType(postType);
        if (!type) return;

        switch (String(type)) {
            case 'review':
            case 'checkin':         // supports normalized "checkin"
            case 'check-in': {      // extra safety if not normalized
                const postKeys = computeReviewPostKeys(state, postId);
                dispatch(
                    applyReviewUpdates({
                        postId,
                        postKeys,
                        updates: reviewUpdates,
                    })
                );
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
