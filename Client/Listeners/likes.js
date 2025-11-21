import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { toggleLike as togglePostLike } from '../Slices/LikesSlice';

import { applyPostUpdates } from '../Slices/PostsSlice';
import { applyNearbyUpdates } from '../Slices/GooglePlacesSlice';
import { applyEventUpdates } from '../Slices/EventsSlice';
import { applyPromotionUpdates } from '../Slices/PromotionsSlice';
import { applyHiddenPostUpdates } from '../Slices/TaggedPostsSlice';
import { applyTaggedPostUpdates } from '../Slices/TaggedPostsSlice';

/* =========================
   Config
========================= */
// 🔁 If your PostsSlice is registered under a different key, change this:
const POSTS_SLICE_KEY = 'posts';

/* =========================
   Perf helpers
========================= */
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
  // robust to reducer key casing
  const gp = state?.googlePlaces || state?.GooglePlaces;
  const list = gp?.nearbySuggestions || [];
  const sId = String(postId);
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (String(it?._id) === sId) return { idx: i, kind: 'self' };
    if (String(it?.post?._id) === sId) return { idx: i, kind: 'post' };
    if (String(it?.promotion?._id) === sId) return { idx: i, kind: 'promotion' };
    if (String(it?.event?._id) === sId) return { idx: i, kind: 'event' };
  }
  return null;
}

/* =========================
   Presence predicates
========================= */
// ✅ Use your new collection names that live in PostsSlice
const ALL_POST_KEYS = [
  'businessPosts',
  'localPosts',
  'profilePosts',
  'otherUserPosts',
  'userAndFriendsPosts',
  'suggestedPosts',
];
const ALWAYS_POST_KEYS = ['profilePosts', 'userAndFriendsPosts', 'suggestedPosts'];

const inPosts = (state, postId) => {
  const ps = state?.[POSTS_SLICE_KEY] || {};
  for (let i = 0; i < ALL_POST_KEYS.length; i++) {
    if (hasId(ps[ALL_POST_KEYS[i]], postId)) return true;
  }
  const sel = ps?.selectedPost; // <-- was selectedReview before
  return !!(sel && String(sel._id) === String(postId));
};

function computePostKeys(state, postId) {
  const ps = state?.[POSTS_SLICE_KEY] || {};
  const keys = new Set(ALWAYS_POST_KEYS);
  for (const k of ALL_POST_KEYS) {
    if (hasId(ps[k], postId)) keys.add(k);
  }
  return [...keys];
}

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

/* =========================
   Listener
========================= */
export const likesListener = createListenerMiddleware();

likesListener.startListening({
  matcher: isAnyOf(togglePostLike.fulfilled, togglePostLike.rejected),
  effect: async (action, api) => {
    const { dispatch, getState } = api;
    const state = getState();

    try {
      if (action.type !== togglePostLike.fulfilled.type) return;

      const {
        postId,
        likes = [],
        likesCount = Array.isArray(likes) ? likes.length : 0,
        liked = false,
      } = action.payload || {};
      if (!postId) return;

      const likeUpdates = { __updatePostLikes: { likes, likesCount, liked } };

      // 🔁 Posts collections (PostsSlice)
      if (inPosts(state, postId)) {
        const postKeys = computePostKeys(state, postId);
        dispatch(applyPostUpdates({ postId, postKeys, updates: likeUpdates }));
      } else {
        // Fallback: try all lists in PostsSlice (safe no-ops where lists don’t exist)
        dispatch(applyPostUpdates({ postId, postKeys: ALL_POST_KEYS, updates: likeUpdates }));
      }

      // Nearby
      if (inNearby(state, postId)) {
        dispatch(applyNearbyUpdates({ postId, updates: likeUpdates }));
      }

      // Events
      if (inEvents(state, postId)) {
        dispatch(applyEventUpdates({ postId, updates: likeUpdates }));
      }

      // Promotions
      if (inPromos(state, postId)) {
        dispatch(applyPromotionUpdates({ postId, updates: likeUpdates }));
      }

      dispatch(
        applyTaggedPostUpdates({
          postId,
          updates: likeUpdates,
          alsoMatchSharedOriginal: true,
          // we keep hidden handled separately below so we don't double-update
          includeHidden: false,
        })
      );

      // Hidden/Tagged
      if (inHiddenTagged(state, postId)) {
        dispatch(applyHiddenPostUpdates({ postId, updates: likeUpdates }));
      }
    } catch {
      // listeners must not throw
    }
  },
});
