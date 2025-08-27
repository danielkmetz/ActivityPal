import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { applyPostUpdates } from '../Slices/ReviewsSlice';
import {
  addComment,
  addReply,
  toggleLike,
  editComment,
  deleteComment,
} from '../Slices/CommentsSlice';
import { applyNearbyUpdates } from '../Slices/GooglePlacesSlice';

// --- helpers you already have (or paste them here) ---
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
    if (Array.isArray(arr) && arr.some((p) => String(p._id) === String(postId))) {
      keys.add(k);
    }
  }
  return [...keys];
}

function findTopLevelCommentIdInPost(post, targetId) {
  const stack = (post?.comments || []).map((c) => ({ node: c, topId: c._id }));
  while (stack.length) {
    const { node, topId } = stack.pop();
    if (String(node._id) === String(targetId)) return topId;
    if (node.replies?.length) {
      for (const r of node.replies) stack.push({ node: r, topId });
    }
  }
  return null;
}

function buildCommentLikesPayload(state, postId, commentId, likes, topLevelCommentId) {
  if (topLevelCommentId) {
    const isTop = String(topLevelCommentId) === String(commentId);
    return isTop
      ? { commentId: topLevelCommentId, likes: likes || [] }
      : { commentId: topLevelCommentId, replyId: commentId, likes: likes || [] };
  }

  const rs = state?.reviews || {};
  const lists = ALL_COLLECTION_KEYS.map((k) => rs[k]).filter(Boolean);
  if (rs?.selectedReview && String(rs.selectedReview._id) === String(postId)) {
    lists.push([rs.selectedReview]);
  }

  for (const list of lists) {
    for (const post of list) {
      if (String(post._id) !== String(postId)) continue;

      if ((post.comments || []).some((c) => String(c._id) === String(commentId))) {
        return { commentId, likes: likes || [] };
      }

      const top = findTopLevelCommentIdInPost(post, commentId);
      if (top) return { commentId: top, replyId: commentId, likes: likes || [] };
    }
  }
  return { commentId, likes: likes || [] };
}

// --- local helpers for nearbySuggestions ---
const isPostInNearbySuggestions = (rootState, postId) => {
  const list = rootState?.GooglePlaces?.nearbySuggestions || [];
  return Array.isArray(list) && list.some((p) => String(p?._id) === String(postId));
};

const toNearbyUpdateShape = {
  addComment: ({ comment }) => ({ __appendComment: comment }),
  addReply:   ({ commentId, reply }) => ({ __appendReply: { commentId, reply } }),
  editComment: ({ updatedComment }) =>
    ({ __updateComment: { commentId: updatedComment?._id, updatedComment } }),
  deleteComment: ({ commentId }) => ({ __deleteComment: commentId }),
  toggleLike: (rootState, payload) => {
    const { postId, commentId, likes, topLevelCommentId } = payload || {};
    const base = buildCommentLikesPayload(rootState, postId, commentId, likes, topLevelCommentId);
    return { __updateCommentLikes: base };
  },
};

export const commentsListener = createListenerMiddleware();

function dispatchUpdates(dispatch, state, { postId, updates }) {
  const postKeys = computePostKeys(state, postId);
  dispatch(
    applyPostUpdates({
      postId,
      postKeys,
      updates: updates || {},
    })
  );
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
    const state = getState();

    try {
      // -------- ReviewsSlice updates (unchanged) --------
      if (action.type === addComment.fulfilled.type) {
        const { postId, comment } = action.payload || {};
        if (postId && comment) {
          dispatchUpdates(dispatch, state, { postId, updates: { __appendComment: comment } });
        }
      }

      if (action.type === addReply.fulfilled.type) {
        const { postId, commentId, reply } = action.payload || {};
        if (postId && commentId && reply) {
          dispatchUpdates(dispatch, state, {
            postId,
            updates: { __appendReply: { commentId, reply } },
          });
        }
      }

      if (action.type === toggleLike.fulfilled.type) {
        const { postId, commentId, likes, topLevelCommentId } = action.payload || {};
        if (postId && commentId) {
          const payload = buildCommentLikesPayload(state, postId, commentId, likes, topLevelCommentId);
          dispatchUpdates(dispatch, state, { postId, updates: { __updateCommentLikes: payload } });
        }
      }

      if (action.type === editComment.fulfilled.type) {
        const { postId, updatedComment } = action.payload || {};
        if (postId && updatedComment?._id) {
          dispatchUpdates(dispatch, state, {
            postId,
            updates: { __updateComment: { commentId: updatedComment._id, updatedComment } },
          });
        }
      }

      if (action.type === deleteComment.fulfilled.type) {
        const { postId, commentId } = action.payload || {};
        if (postId && commentId) {
          dispatchUpdates(dispatch, state, { postId, updates: { __deleteComment: commentId } });
        }
      }

      // -------- GooglePlaces nearbySuggestions fanout (single reducer) --------
      const payload = action.payload || {};
      const { postId } = payload;
      if (!postId) return;
      if (!isPostInNearbySuggestions(getState(), postId)) return;

      let updates = null;

      if (action.type === addComment.fulfilled.type) {
        updates = toNearbyUpdateShape.addComment(payload);
      } else if (action.type === addReply.fulfilled.type) {
        updates = toNearbyUpdateShape.addReply(payload);
      } else if (action.type === editComment.fulfilled.type) {
        if (payload.updatedComment?._id) updates = toNearbyUpdateShape.editComment(payload);
      } else if (action.type === deleteComment.fulfilled.type) {
        updates = toNearbyUpdateShape.deleteComment(payload);
      } else if (action.type === toggleLike.fulfilled.type) {
        updates = toNearbyUpdateShape.toggleLike(state, payload);
      }

      if (updates) {
        dispatch(
          applyNearbyUpdates({
            postId,
            updates,
            // debug: true,
            // label: 'nearby-fanout',
          })
        );
      }
    } catch {
      // swallow to prevent crashing the thunk pipeline
    }
  },
});
