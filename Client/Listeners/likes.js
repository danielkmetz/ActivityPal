import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';

// ✅ Thunk from your new unified likes slice
import { toggleLike as togglePostLike } from '../Slices/LikesSlice';

// ✅ Post collections updaters you already use elsewhere
import { applyPostUpdates } from '../Slices/ReviewsSlice';         // reviews
import { applyNearbyUpdates } from '../Slices/GooglePlacesSlice';  // nearby suggestions
import { applyEventUpdates } from '../Slices/EventsSlice';         // events
import { applyPromotionUpdates } from '../Slices/PromotionsSlice'; // promotions
import { applyHiddenPostUpdates } from '../Slices/TaggedPostsSlice'; // hidden posts

/* =========================
   Small perf helpers
========================= */

// Cache: arrayRef -> Set(ids) for O(1) membership tests.
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

function findNearbySuggestion(state, postId) {
  const list = state?.GooglePlaces?.nearbySuggestions || [];
  const sId = String(postId);

  for (let i = 0; i < list.length; i++) {
    const it = list[i];

    if (String(it?._id) === sId) return { idx: i, kind: 'self' };
    if (String(it?.post?._id) === sId) return { idx: i, kind: 'post' };
    if (String(it?.promotion?._id) === sId) return { idx: i, kind: 'promotion' };
    if (String(it?.event?._id) === sId) return { idx: i, kind: 'event' };
    // add other shapes you use in nearby cards here
  }
  return null;
}

/* =========================
   Presence predicates
========================= */

const ALL_REVIEW_KEYS = [
  'businessReviews',
  'localReviews',
  'profileReviews',
  'otherUserReviews',
  'userAndFriendsReviews',
  'suggestedPosts',
];
const ALWAYS_REVIEW_KEYS = ['profileReviews', 'userAndFriendsReviews', 'suggestedPosts'];

const inReviews = (state, postId) => {
  const rs = state?.reviews || {};
  for (let i = 0; i < ALL_REVIEW_KEYS.length; i++) {
    if (hasId(rs[ALL_REVIEW_KEYS[i]], postId)) return true;
  }
  const sel = rs?.selectedReview;
  return !!(sel && String(sel._id) === String(postId));
};

const inNearby = (state, postId) => !!findNearbySuggestion(state, postId);

const inEvents = (state, postId) => {
  const list = state?.events?.events || [];
  if (hasId(list, postId)) return true;
  const sel = state?.events?.selectedEvent;
  return !!(sel && String(sel._id) === String(postId));
};

const inPromos = (state, postId) => {
  const list = state?.promotions?.promotions || [];
  if (hasId(list, postId)) return true;
  const sel = state?.promotions?.selectedPromotion;
  return !!(sel && String(sel._id) === String(postId));
};

const inHiddenTagged = (state, postId) => {
  const list = state?.taggedPosts?.hidden?.items || [];
  const pid = String(postId);
  return list.some((w) => {
    const p = w?.post || w?.review || w?.checkIn || w?.sharedPost || w?.live;
    return p && String(p._id || p.id) === pid;
  });
};

function computeReviewPostKeys(state, postId) {
  const keys = new Set(ALWAYS_REVIEW_KEYS);
  const rs = state?.reviews || {};
  for (const k of ALL_REVIEW_KEYS) {
    if (hasId(rs[k], postId)) keys.add(k);
  }
  return [...keys];
}

/* =========================
   Listener
========================= */

export const likesListener = createListenerMiddleware();

/**
 * We only need to listen to the unified likes thunk’s lifecycle.
 * If you later add optimistic updates, you can wire `.pending` as well.
 */
likesListener.startListening({
  matcher: isAnyOf(
    togglePostLike.fulfilled,
    togglePostLike.rejected
  ),
  effect: async (action, api) => {
    const { dispatch, getState } = api;
    const state = getState();

    try {
      // Only act on success
      if (action.type !== togglePostLike.fulfilled.type) return;

      const { postType, postId, data } = action.payload || {};
      if (!postId || !data) return;

      const { likes = [], likesCount = Array.isArray(likes) ? likes.length : 0, liked = false } = data;

      // Uniform update shape understood by your collection reducers
      const likeUpdates = { __updatePostLikes: { likes, likesCount, liked } };

      // ---- Reviews (includes review and check-in posts if they live in reviews state) ----
      if (postType === 'reviews' || inReviews(state, postId)) {
        const postKeys = computeReviewPostKeys(state, postId);
        dispatch(applyPostUpdates({ postId, postKeys, updates: likeUpdates }));
      }

      // ---- Nearby Suggestions (GooglePlaces-backed suggestions that include posts) ----
      if (inNearby(state, postId)) {
        console.log('in nearby in listener', inNearby(state, postId))
        dispatch(applyNearbyUpdates({ postId, updates: likeUpdates }));
      }

      // ---- Events ----
      if (postType === 'events' || inEvents(state, postId)) {
        dispatch(applyEventUpdates({ postId, updates: likeUpdates }));
      }

      // ---- Promotions ----
      if (postType === 'promotions' || inPromos(state, postId)) {
        dispatch(applyPromotionUpdates({ postId, updates: likeUpdates }));
      }

      // ---- Hidden Posts ----
      if (inHiddenTagged(state, postId)) {
        dispatch(applyHiddenPostUpdates({ postId, updates: likeUpdates }));
      }

      /**
       * OPTIONAL HOOKS:
       * - Live Streams: if you expose an `applyLiveUpdates({ postId, updates })`,
       *   call it here when `postType === 'liveStreams'`.
       * - Shared Posts: likewise, if you have an updater for a `sharedPosts` slice.
       *
       * Example:
       *   if (postType === 'liveStreams') dispatch(applyLiveUpdates({ postId, updates: likeUpdates }));
       */
    } catch {
      // never throw from listeners
    }
  },
});
