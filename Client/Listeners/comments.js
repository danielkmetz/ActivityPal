import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { applyPostUpdates } from '../Slices/PostsSlice';
import {
  addComment,
  addReply,
  toggleLike,
  editComment,
  deleteComment,
} from '../Slices/CommentsSlice';
import { applyNearbyUpdates } from '../Slices/GooglePlacesSlice';
import { applyEventUpdates } from '../Slices/EventsSlice';
import { applyPromotionUpdates } from '../Slices/PromotionsSlice';

/* =========================
   Small perf + identity helpers
========================= */

const toStr = (v) => (v == null ? '' : String(v));
const getId = (x) => toStr(x?._id ?? x?.id);
const isSharedPost = (p) => {
  const t = p?.type || p?.postType || p?.canonicalType;
  return t === 'sharedPost' || t === 'sharedPosts';
};
const getOriginalId = (p) => (isSharedPost(p) ? getId(p.original) : '');

// Cache: arrayRef -> Set(ids) for O(1) membership tests.
// Now supports both _id and id.
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

// Does arr contain either the item id OR a sharedPost.original.id?
// ---- replace containsIdOrOriginal ----
const containsIdOrOriginal = (arr, id) => {
  if (!Array.isArray(arr)) return false;
  const s = toStr(id);
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (getId(p) === s) return true;
    if (isSharedPost(p)) {
      if (getId(p.original) === s) return true;
      const opid = toStr(p?.originalPostId);
      if (opid && opid === s) return true;
    }
  }
  return false;
};

// ---- replace findByIdOrOriginal ----
const findByIdOrOriginal = (arr, id) => {
  if (!Array.isArray(arr)) return null;
  const s = toStr(id);
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (getId(p) === s) return p;
    if (isSharedPost(p)) {
      if (getId(p.original) === s) return p.original || null;
      const opid = toStr(p?.originalPostId);
      if (opid && opid === s) return p.original || null; // may be null if not hydrated yet
    }
  }
  return null;
};

/* =========================
   Post helpers
========================= */

const ALL_COLLECTION_KEYS = [
  'businessPosts',
  'localPosts',
  'profilePosts',
  'otherUserPosts',
  'userAndFriendsPosts',
  'suggestedPosts',
];
const ALWAYS_KEYS = ['profilePosts', 'userAndFriendsPosts', 'suggestedPosts'];

function computePostKeysFromPosts(state, postId) {
  const keys = new Set(ALWAYS_KEYS);
  const ps = state?.posts || {};
  for (const k of ALL_COLLECTION_KEYS) {
    if (containsIdOrOriginal(ps[k], postId)) keys.add(k);
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
 */
function buildLikesPayloadFromSource({ list, selected, postId, commentId, likes, topLevelCommentId }) {
  // server-provided is best
  if (topLevelCommentId) {
    return String(topLevelCommentId) === String(commentId)
      ? { commentId: topLevelCommentId, likes: likes || [] }
      : { commentId: topLevelCommentId, replyId: commentId, likes: likes || [] };
  }

  // Try to locate the post in a list or the selected item (supports shared originals)
  let post = findByIdOrOriginal(list, postId);
  if (!post && selected) {
    if (getId(selected) === toStr(postId)) post = selected;
    else if (isSharedPost(selected) && getId(selected.original) === toStr(postId)) post = selected.original;
  }
  if (!post) return { commentId, likes: likes || [] };

  // Top-level vs reply detection
  const sId = String(commentId);
  if ((post.comments || []).some((c) => String(c?._id) === sId)) {
    return { commentId, likes: likes || [] };
  }
  const top = findTopLevelCommentIdInPost(post, commentId);
  return top
    ? { commentId: top, replyId: commentId, likes: likes || [] }
    : { commentId, likes: likes || [] };
}

/* =========================
   Presence predicates
========================= */

const inPosts = (state, postId) => {
  const ps = state?.posts || {};
  for (let i = 0; i < ALL_COLLECTION_KEYS.length; i++) {
    const key = ALL_COLLECTION_KEYS[i];
    if (containsIdOrOriginal(ps[key], postId)) return true;
  }
  const sel = ps?.selectedPost;
  if (!sel) return false;
  return (
    getId(sel) === toStr(postId) ||
    (isSharedPost(sel) && getId(sel.original) === toStr(postId))
  );
};

const inNearby = (state, postId) => {
  const list = state?.GooglePlaces?.nearbySuggestions || [];
  return hasId(list, postId); // nearby items typically aren't shared wrappers
};

const inEvents = (state, postId) => {
  const list = state?.events?.events || [];
  if (containsIdOrOriginal(list, postId)) return true;
  const sel = state?.events?.selectedEvent;
  return !!(
    sel &&
    (getId(sel) === toStr(postId) ||
      (isSharedPost(sel) && getId(sel.original) === toStr(postId)))
  );
};

const inPromos = (state, postId) => {
  const list = state?.promotions?.promotions || [];
  if (containsIdOrOriginal(list, postId)) return true;
  const sel = state?.promotions?.selectedPromotion;
  return !!(
    sel &&
    (getId(sel) === toStr(postId) ||
      (isSharedPost(sel) && getId(sel.original) === toStr(postId)))
  );
};

/* =========================
   Comment control-shape builders
========================= */

const toControlShape = {
  addComment: ({ comment }) => ({ __appendComment: comment }),
  addReply: ({ commentId, reply }) => ({ __appendReply: { commentId, reply } }),
  editComment: ({ updatedComment }) => ({
    __updateComment: { commentId: updatedComment?._id, updatedComment },
  }),
  deleteComment: ({ commentId }) => ({ __deleteComment: commentId }),
};

export const commentsListener = createListenerMiddleware();

function dispatchPostUpdates(dispatch, state, { postId, updates }) {
  const postKeys = computePostKeysFromPosts(state, postId);
  dispatch(applyPostUpdates({ postId, postKeys, updates: updates || {} }));
}

// ---- replace preferOriginalIdForComments ----
const preferOriginalIdForComments = (state, postId) => {
  const sId = toStr(postId);
  const ps = state?.posts || {};

  for (const key of ALL_COLLECTION_KEYS) {
    const arr = ps[key] || [];
    for (const item of arr) {
      if (getId(item) === sId && isSharedPost(item)) {
        const oid = getId(item.original) || toStr(item.originalPostId);
        if (oid) return oid;
      }
    }
  }
  const sel = ps.selectedPost;
  if (sel && getId(sel) === sId && isSharedPost(sel)) {
    const oid = getId(sel.original) || toStr(sel.originalPostId);
    if (oid) return oid;
  }
  return postId;
};

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

      const isCommentMutation =
        action.type === addComment.fulfilled.type ||
        action.type === addReply.fulfilled.type ||
        action.type === editComment.fulfilled.type ||
        action.type === deleteComment.fulfilled.type ||
        action.type === toggleLike.fulfilled.type;

      const targetPostId = isCommentMutation
        ? preferOriginalIdForComments(state, postId)
        : postId;

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

      /* ---------- Posts (reviews/check-ins/shared) ---------- */
      if (inPosts(state, targetPostId)) {
        if (action.type === toggleLike.fulfilled.type) {
          const { commentId, likes, topLevelCommentId } = payload;
          if (commentId) {
            const ps = state?.posts || {};
            let likesPayload = null;

            for (let i = 0; i < ALL_COLLECTION_KEYS.length; i++) {
              const key = ALL_COLLECTION_KEYS[i];
              const arr = ps[key];
              if (containsIdOrOriginal(arr, targetPostId)) {
                likesPayload = buildLikesPayloadFromSource({
                  list: arr,
                  selected: ps.selectedPost,
                  postId: targetPostId,
                  commentId,
                  likes,
                  topLevelCommentId,
                });
                break;
              }
            }
            if (!likesPayload) {
              likesPayload = buildLikesPayloadFromSource({
                list: [],
                selected: ps.selectedPost,
                postId: targetPostId,
                commentId,
                likes,
                topLevelCommentId,
              });
            }
            dispatchPostUpdates(dispatch, state, {
              postId: targetPostId,
              updates: { __updateCommentLikes: likesPayload },
            });
          }
        } else if (baseUpdates) {
          dispatchPostUpdates(dispatch, state, {
            postId: targetPostId,
            updates: baseUpdates,
          });
        }
      }

      /* ---------- Nearby Suggestions ---------- */
      if (inNearby(state, targetPostId)) {
        if (action.type === toggleLike.fulfilled.type) {
          const { commentId, likes, topLevelCommentId } = payload;
          if (commentId) {
            const list = state?.GooglePlaces?.nearbySuggestions || [];
            const likesPayload = buildLikesPayloadFromSource({
              list,
              selected: null,
              postId: targetPostId,
              commentId,
              likes,
              topLevelCommentId,
            });
            dispatch(applyNearbyUpdates({ postId: targetPostId, updates: { __updateCommentLikes: likesPayload } }));
          }
        } else if (baseUpdates) {
          dispatch(applyNearbyUpdates({ postId: targetPostId, updates: baseUpdates }));
        }
      }

      /* ---------- Events ---------- */
      if (inEvents(state, targetPostId)) {
        if (action.type === toggleLike.fulfilled.type) {
          const { commentId, likes, topLevelCommentId } = payload;
          if (commentId) {
            const list = state?.events?.events || [];
            const selected = state?.events?.selectedEvent || null;
            const likesPayload = buildLikesPayloadFromSource({
              list,
              selected,
              postId: targetPostId,
              commentId,
              likes,
              topLevelCommentId,
            });
            dispatch(applyEventUpdates({ postId: targetPostId, updates: { __updateCommentLikes: likesPayload } }));
          }
        } else if (baseUpdates) {
          dispatch(applyEventUpdates({ postId: targetPostId, updates: baseUpdates }));
        }
      }

      /* ---------- Promotions ---------- */
      if (inPromos(state, targetPostId)) {
        if (action.type === toggleLike.fulfilled.type) {
          const { commentId, likes, topLevelCommentId } = payload;
          if (commentId) {
            const list = state?.promotions?.promotions || [];
            const selected = state?.promotions?.selectedPromotion || null;
            const likesPayload = buildLikesPayloadFromSource({
              list,
              selected,
              postId: targetPostId,
              commentId,
              likes,
              topLevelCommentId,
            });
            dispatch(applyPromotionUpdates({ postId: targetPostId, updates: { __updateCommentLikes: likesPayload } }));
          }
        } else if (baseUpdates) {
          dispatch(applyPromotionUpdates({ postId: targetPostId, updates: baseUpdates }));
        }
      }
    } catch (err) {
      if (__DEV__) console.error('[commentsListener] effect error:', err);
    }
  },
});
