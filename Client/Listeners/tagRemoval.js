import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { removeSelfFromPost, removeSelfFromPhoto } from '../Slices/RemoveTagsSlice';
import { applyPostUpdates as applyReviewUpdates } from '../Slices/PostsSlice';
import { applyEventUpdates } from '../Slices/EventsSlice';
import { applyPromotionUpdates } from '../Slices/PromotionsSlice';
import { applyTaggedPostUpdates, filterTaggedPost } from '../Slices/TaggedPostsSlice';
import { normalizePostType } from '../utils/normalizePostType';
import { selectUser } from '../Slices/UserSlice';

/* ===== helpers ===== */

// cache for arrayRef -> Set(ids)
const idSetCache = new WeakMap();
const getIdSet = (arr) => {
  if (!Array.isArray(arr)) return null;
  let set = idSetCache.get(arr);
  if (!set) {
    set = new Set(
      arr.flatMap((p) => {
        const out = [];
        if (p?._id != null) out.push(String(p._id));
        if (p?.id != null) out.push(String(p.id));
        return out;
      })
    );
    idSetCache.set(arr, set);
  }
  return set;
};

const hasId = (arr, id) => {
  const set = getIdSet(arr);
  return set ? set.has(String(id)) : false;
};

const REVIEW_KEYS = [
  'businessPosts',
  'localPosts',
  'profilePosts',
  'otherUserPosts',
  'userAndFriendsPosts',
  'suggestedPosts',
];
const ALWAYS_REVIEW_KEYS = ['profilePosts', 'userAndFriendsPosts', 'suggestedPosts'];

function computeReviewPostKeys(state, postId) {
  const keys = new Set(ALWAYS_REVIEW_KEYS);
  // ⬇️ use unified posts slice
  const ps = state?.posts || {};
  for (const k of REVIEW_KEYS) {
    if (hasId(ps[k], postId)) keys.add(k);
  }
  return [...keys];
}

function resolveUntagUserId(data, getState) {
  // 1) Prefer what the server returns (most reliable)
  if (data && data.userId) return String(data.userId);

  // 2) Fallback to client state via selector
  const user = selectUser(getState());
  const id = user?.id || user?._id;
  return id ? String(id) : null;
}

/* ===== listener ===== */

export const tagRemovalListener = createListenerMiddleware();

tagRemovalListener.startListening({
  matcher: isAnyOf(removeSelfFromPost.fulfilled, removeSelfFromPhoto.fulfilled),
  effect: async (action, api) => {
    const { dispatch, getState } = api;

    const { postType, postId, photoId, data } = action.payload || {};
    if (!postType || !postId) return;

    const isPostWide = action.type === removeSelfFromPost.fulfilled.type;
    const type = normalizePostType(postType);
    const userId = resolveUntagUserId(data, getState);

    if (!type || !userId) return;

    // Build control updates for the main feeds
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

    const state = getState();

    // ----- Main collections (posts/events/promos) -----
    switch (String(type)) {
      case 'review':
      case 'checkin':
      case 'liveStream':
      case 'sharedPost':
      case 'check-in': {
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

    // ----- Tagged posts slice (taggedPosts.byUser & hidden) -----
    // Limit to the user who untagged themselves; safe no-op if post isn't in tagged feeds.
    const taggedUpdates = isPostWide ? reviewUpdates : mediaOnlyUpdates;
    dispatch(
      applyTaggedPostUpdates({
        postId,
        updates: taggedUpdates,
        alsoMatchSharedOriginal: true,
        includeHidden: true,       // also update hidden-tag wrappers for this user
        limitToUserIds: [userId],  // only this user's tagged feeds
      })
    );

    // ----- Remove the post from this user's tagged feed when it's post-wide -----
    if (isPostWide) {
      // "Remove me from this post" => user is no longer tagged anywhere,
      // so it's safe to drop from their tagged posts feed.
      dispatch(
        filterTaggedPost({
          postType: type, // normalized ('review', 'check-in', 'event', 'promotion', etc.)
          postId,
          forUserId: userId,
        })
      );
    }

    // If you later want to ALSO drop it from the hidden-tagged list when post-wide,
    // you can dispatch removeFromHiddenTagged({ postType: type, postId }) here.
  },
});
