import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';

// Reviews
import { applyPostUpdates } from '../Slices/PostsSlice';

// Comment thunks
import {
  addComment,
  addReply,
  toggleLike,
  editComment,
  deleteComment,
} from '../Slices/CommentsSlice';

// Nearby Suggestions (GooglePlaces)
import { applyNearbyUpdates } from '../Slices/GooglePlacesSlice';

// Events & Promotions unified updaters
import { applyEventUpdates } from '../Slices/EventsSlice';          
import { applyPromotionUpdates } from '../Slices/PromotionsSlice';  

/* =========================
   Small perf helpers
========================= */

// Cache: arrayRef -> Set(ids) for O(1) membership tests.
// New arrays (Immer drafts) get new refs, so cache stays correct.
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

const findById = (arr, id) => {
  if (!Array.isArray(arr)) return null;
  const s = String(id);
  // Quick path: many lists keep objects at shallow depth; findIndex is OK after set check
  if (!hasId(arr, id)) return null;
  const idx = arr.findIndex((p) => String(p?._id) === s);
  return idx >= 0 ? arr[idx] : null;
};

/* =========================
   Reviews helpers
========================= */

const ALL_COLLECTION_KEYS = [
  'businessReviews',
  'localReviews',
  'profileReviews',
  'otherUserReviews',
  'userAndFriendsReviews',
  'suggestedPosts',
];
const ALWAYS_KEYS = ['profileReviews', 'userAndFriendsReviews', 'suggestedPosts'];

function computePostKeys(state, postId) {
  const keys = new Set(ALWAYS_KEYS);
  const rs = state?.reviews || {};
  for (const k of ALL_COLLECTION_KEYS) {
    const arr = rs[k];
    if (hasId(arr, postId)) keys.add(k);
  }
  return [...keys];
}

function findTopLevelCommentIdInPost(post, targetId) {
  const stack = (post?.comments || []).map((c) => ({ node: c, topId: c._id }));
  const target = String(targetId);
  while (stack.length) {
    const { node, topId } = stack.pop();
    if (String(node._id) === target) return topId;
    if (node.replies?.length) {
      for (let i = 0; i < node.replies.length; i++) {
        const r = node.replies[i];
        if (r && typeof r === 'object') stack.push({ node: r, topId });
      }
    }
  }
  return null;
}

/**
 * Build { commentId, [replyId], likes } by scanning a specific source quickly.
 * We first locate the single post (O(#lists)), then do a local tree walk.
 */
function buildLikesPayloadFromSource({ list, selected, postId, commentId, likes, topLevelCommentId }) {
  // If backend provides, use it directly (zero scans).
  if (topLevelCommentId) {
    return String(topLevelCommentId) === String(commentId)
      ? { commentId: topLevelCommentId, likes: likes || [] }
      : { commentId: topLevelCommentId, replyId: commentId, likes: likes || [] };
  }

  // 1) Get the post fast
  let post = findById(list, postId);
  if (!post && selected && String(selected._id) === String(postId)) post = selected;
  if (!post) return { commentId, likes: likes || [] };

  // 2) Is commentId a top-level comment?
  const sId = String(commentId);
  if ((post.comments || []).some((c) => String(c?._id) === sId)) {
    return { commentId, likes: likes || [] };
  }

  // 3) Otherwise, find its top ancestor
  const top = findTopLevelCommentIdInPost(post, commentId);
  return top ? { commentId: top, replyId: commentId, likes: likes || [] }
    : { commentId, likes: likes || [] };
}

/* =========================
   Presence predicates (O(1) via idSet)
========================= */

const inReviews = (state, postId) => {
  const rs = state?.reviews || {};
  for (let i = 0; i < ALL_COLLECTION_KEYS.length; i++) {
    if (hasId(rs[ALL_COLLECTION_KEYS[i]], postId)) return true;
  }
  const sel = rs?.selectedReview;
  return !!(sel && String(sel._id) === String(postId));
};

const inNearby = (state, postId) => {
  const list = state?.GooglePlaces?.nearbySuggestions || [];
  return hasId(list, postId);
};

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

/* =========================
   Common control-shape builders
========================= */

const toControlShape = {
  addComment: ({ comment }) => ({ __appendComment: comment }),
  addReply: ({ commentId, reply }) => ({ __appendReply: { commentId, reply } }),
  editComment: ({ updatedComment }) =>
    ({ __updateComment: { commentId: updatedComment?._id, updatedComment } }),
  deleteComment: ({ commentId }) => ({ __deleteComment: commentId }),
};

export const commentsListener = createListenerMiddleware();

function dispatchReviewUpdates(dispatch, state, { postId, updates }) {
  const postKeys = computePostKeys(state, postId);
  dispatch(applyPostUpdates({ postId, postKeys, updates: updates || {} }));
}

commentsListener.startListening({
  matcher: isAnyOf(
    addComment.fulfilled,
    addReply.fulfilled,
    toggleLike.fulfilled,
    editComment.fulfilled,
    deleteComment.fulfilled
  ),
  effect: async (action, api) => {
    const { dispatch, getState } = api;
    const state = getState(); // single read

    try {
      const payload = action.payload || {};
      const { postId } = payload;
      if (!postId) return;

      /* ---------- Build REUSABLE updates by action ---------- */
      let baseUpdates = null;
      if (action.type === addComment.fulfilled.type) {
        if (payload.comment) baseUpdates = toControlShape.addComment(payload);
      } else if (action.type === addReply.fulfilled.type) {
        if (payload.commentId && payload.reply) baseUpdates = toControlShape.addReply(payload);
      } else if (action.type === editComment.fulfilled.type) {
        if (payload.updatedComment?._id) baseUpdates = toControlShape.editComment(payload);
      } else if (action.type === deleteComment.fulfilled.type) {
        if (payload.commentId) baseUpdates = toControlShape.deleteComment(payload);
      }

      /* ---------- Reviews (also handles likes with structure inference) ---------- */
      if (inReviews(state, postId)) {
        if (action.type === toggleLike.fulfilled.type) {
          const { commentId, likes, topLevelCommentId } = payload;
          if (commentId) {
            // Quick per-source likes payload for reviews
            // We only need to identify which one review list actually contains the post.
            // Iterate small fixed set of lists with O(1) membership checks.
            const rs = state?.reviews || {};
            let likesPayload = null;

            for (let i = 0; i < ALL_COLLECTION_KEYS.length; i++) {
              const key = ALL_COLLECTION_KEYS[i];
              const arr = rs[key];
              if (hasId(arr, postId)) {
                likesPayload = buildLikesPayloadFromSource({
                  list: arr,
                  selected: rs.selectedReview,
                  postId,
                  commentId,
                  likes,
                  topLevelCommentId,
                });
                break;
              }
            }
            // fallback to selectedReview if not in any list
            if (!likesPayload && rs?.selectedReview && String(rs.selectedReview._id) === String(postId)) {
              likesPayload = buildLikesPayloadFromSource({
                list: [],
                selected: rs.selectedReview,
                postId,
                commentId,
                likes,
                topLevelCommentId,
              });
            }
            if (!likesPayload) {
              // final fallback
              likesPayload = { commentId, likes: likes || [] };
            }
            dispatchReviewUpdates(dispatch, state, { postId, updates: { __updateCommentLikes: likesPayload } });
          }
        } else if (baseUpdates) {
          dispatchReviewUpdates(dispatch, state, { postId, updates: baseUpdates });
        }
      }

      /* ---------- Nearby Suggestions ---------- */
      if (inNearby(state, postId)) {
        if (action.type === toggleLike.fulfilled.type) {
          const { commentId, likes, topLevelCommentId } = payload;
          if (commentId) {
            const list = state?.GooglePlaces?.nearbySuggestions || [];
            const likesPayload = buildLikesPayloadFromSource({
              list,
              selected: null,
              postId,
              commentId,
              likes,
              topLevelCommentId,
            });
            dispatch(applyNearbyUpdates({ postId, updates: { __updateCommentLikes: likesPayload } }));
          }
        } else if (baseUpdates) {
          dispatch(applyNearbyUpdates({ postId, updates: baseUpdates }));
        }
      }

      /* ---------- Events ---------- */
      if (inEvents(state, postId)) {
        if (action.type === toggleLike.fulfilled.type) {
          const { commentId, likes, topLevelCommentId } = payload;
          if (commentId) {
            const list = state?.events?.events || [];
            const selected = state?.events?.selectedEvent || null;
            const likesPayload = buildLikesPayloadFromSource({
              list,
              selected,
              postId,
              commentId,
              likes,
              topLevelCommentId,
            });
            dispatch(applyEventUpdates({ postId, updates: { __updateCommentLikes: likesPayload } }));
          }
        } else if (baseUpdates) {
          dispatch(applyEventUpdates({ postId, updates: baseUpdates }));
        }
      }

      /* ---------- Promotions ---------- */
      if (inPromos(state, postId)) {
        if (action.type === toggleLike.fulfilled.type) {
          const { commentId, likes, topLevelCommentId } = payload;
          if (commentId) {
            const list = state?.promotions?.promotions || [];
            const selected = state?.promotions?.selectedPromotion || null;
            const likesPayload = buildLikesPayloadFromSource({
              list,
              selected,
              postId,
              commentId,
              likes,
              topLevelCommentId,
            });
            dispatch(applyPromotionUpdates({ postId, updates: { __updateCommentLikes: likesPayload } }));
          }
        } else if (baseUpdates) {
          dispatch(applyPromotionUpdates({ postId, updates: baseUpdates }));
        }
      }
    } catch {
      // protect the thunk pipeline
    }
  },
});
