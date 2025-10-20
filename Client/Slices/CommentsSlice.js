import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getAuthHeaders } from '../utils/Authorization/getAuthHeaders';
import { isAnyOf } from '@reduxjs/toolkit';

const API = `${process.env.EXPO_PUBLIC_SERVER_URL}/comments-replies`;

/* -------------------------------- Helpers ------------------------------- */

const postKey = (postType, postId) => `${postType}:${postId}`;

export const toApiPostType = (t) => {
    switch (t) {
        case 'sharedPost': return 'sharedPosts';
        case 'sharedPosts': return 'sharedPosts';
        case 'sharedposts': return 'sharedPosts';
        case 'review': return 'reviews';
        case 'reviews': return 'reviews';
        case 'liveStream': return 'liveStreams';
        case 'liveStreams': return 'liveStreams';
        case 'promotion': return 'promotions';
        case 'promotions': return 'promotions';
        case 'promos': return 'promotions';
        case 'promo': return 'promotions';
        case 'event': return 'events';
        case 'events': return 'events';
        case 'checkin': return 'checkins';
        case 'check-in': return 'checkins';
        case 'check-ins': return 'checkins';
        case 'checkIn': return 'checkins';
        case 'checkins': return 'checkins';
        case 'invite': return 'invites';
        case 'invites': return 'invites';
        default: return `${t || 'reviews'}s`;
    }
};

/* -------------------------------- Thunks -------------------------------- */

// Add top-level comment
export const addComment = createAsyncThunk(
    'comments/addComment',
    async ({ postType, postId, commentText, media }, { rejectWithValue }) => {
        try {
            const auth = await getAuthHeaders();
            const resolvedType = toApiPostType(postType);

            const { data } = await axios.post(
                `${API}/${resolvedType}/${postId}/comments`,
                { commentText, media },
                auth
            );
            return { postType, postId, comment: data?.comment };
        } catch (err) {
            return rejectWithValue(err.response?.data || { message: 'Failed to add comment' });
        }
    }
);

// Add nested reply (to comment or reply)
export const addReply = createAsyncThunk(
    'comments/addReply',
    async ({ postType, postId, commentId, commentText, media }, { rejectWithValue }) => {
        try {
            const auth = await getAuthHeaders();
            const { data } = await axios.post(
                `${API}/${postType}/${postId}/comments/${commentId}/replies`,
                { commentText, media },
                auth
            );
            return { postType, postId, commentId, reply: data?.reply };
        } catch (err) {
            return rejectWithValue(err.response?.data || { message: 'Failed to add reply' });
        }
    }
);

// Toggle like on a comment or reply
export const toggleLike = createAsyncThunk(
  'comments/toggleLike',
  async ({ postType, postId, commentId }, { rejectWithValue }) => {
    try {
      const auth = await getAuthHeaders();
      const { data } = await axios.put(
        `${API}/${postType}/${postId}/comments/${commentId}/like`,
        {},
        auth
      );

      return {
        postType,
        postId,
        commentId: data?.commentId || commentId,
        likes: data?.likes || [],
        topLevelCommentId: data?.topLevelCommentId || null, // <-- now provided
      };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to toggle like' });
    }
  }
);

// Edit comment or reply (author only)
export const editComment = createAsyncThunk(
    'comments/editComment',
    async ({ postType, postId, commentId, newText, media }, { rejectWithValue }) => {
        try {
            const auth = await getAuthHeaders();
            const resolvedType = toApiPostType(postType);

            const { data } = await axios.patch(
                `${API}/${resolvedType}/${postId}/comments/${commentId}`,
                { newText, media },
                auth
            );
            return { postType, postId, updatedComment: data?.updatedComment };
        } catch (err) {
            return rejectWithValue(err.response?.data || { message: 'Failed to edit comment' });
        }
    }
);

// Delete comment or reply
export const deleteComment = createAsyncThunk(
    'comments/deleteComment',
    async ({ postType, postId, commentId }, { rejectWithValue }) => {
        try {
            const auth = await getAuthHeaders();
            const resolvedType = toApiPostType(postType);

            await axios.delete(`${API}/${resolvedType}/${postId}/comments/${commentId}`, auth);
            return { postType, postId, commentId };
        } catch (err) {
            return rejectWithValue(err.response?.data || { message: 'Failed to delete comment' });
        }
    }
);

/* -------------------------------- Slice --------------------------------- */

const commentsSlice = createSlice({
    name: 'comments',
    initialState: {
        byPost: {
            // [postKey]: { status, error, items: [...] }
        },
    },
    reducers: {
        // Optional: hydrate/replace a thread from a fetched post
        setThread(state, action) {
            const { postType, postId, comments = [] } = action.payload || {};
            const key = postKey(postType, postId);
            state.byPost[key] = state.byPost[key] || { status: 'idle', error: null, items: [] };
            state.byPost[key].items = Array.isArray(comments) ? comments : [];
            state.byPost[key].status = 'succeeded';
            state.byPost[key].error = null;
        },
        clearThread(state, action) {
            const { postType, postId } = action.payload || {};
            const key = postKey(postType, postId);
            delete state.byPost[key];
        },
    },
    extraReducers: (builder) => {
        // Group matchers to avoid repetitive code
        const pendingMatcher = isAnyOf(
            addComment.pending,
            addReply.pending,
            toggleLike.pending,
            editComment.pending,
            deleteComment.pending
        );

        const fulfilledMatcher = isAnyOf(
            addComment.fulfilled,
            addReply.fulfilled,
            toggleLike.fulfilled,
            editComment.fulfilled,
            deleteComment.fulfilled
        );

        const rejectedMatcher = isAnyOf(
            addComment.rejected,
            addReply.rejected,
            toggleLike.rejected,
            editComment.rejected,
            deleteComment.rejected
        );

        // Ensure container exists
        const ensureByPost = (state) => {
            if (!state.byPost) state.byPost = {};
        };

        builder
            // PENDING
            .addMatcher(pendingMatcher, (state, action) => {
                ensureByPost(state);
                const { postType, postId } = action.meta?.arg || {};
                if (!postType || !postId) return; // nothing to track
                const key = postKey(postType, postId);
                const prev = state.byPost[key] || { items: [] };
                state.byPost[key] = {
                    ...prev,
                    status: 'loading',
                    error: null,
                    lastAction: action.type,
                };
            })

            // FULFILLED — do NOT mutate comments here; listener updates reviewsSlice
            .addMatcher(fulfilledMatcher, (state, action) => {
                ensureByPost(state);
                const { postType, postId } = action.meta?.arg || {};
                if (!postType || !postId) return;
                const key = postKey(postType, postId);
                const prev = state.byPost[key] || { items: [] };
                state.byPost[key] = {
                    ...prev,
                    status: 'succeeded',
                    error: null,
                    lastAction: action.type,
                    lastUpdatedAt: Date.now(),
                };
            })

            // REJECTED
            .addMatcher(rejectedMatcher, (state, action) => {
                ensureByPost(state);
                const { postType, postId } = action.meta?.arg || {};
                if (!postType || !postId) return;
                const key = postKey(postType, postId);
                const prev = state.byPost[key] || { items: [] };
                state.byPost[key] = {
                    ...prev,
                    status: 'failed',
                    error: action.payload?.message || action.error?.message || 'Request failed',
                    lastAction: action.type,
                    lastUpdatedAt: Date.now(),
                };
            });
    },
});

/* ------------------------------- Selectors ----------------------------- */

export const selectThread = (state, postType, postId) =>
    state.comments?.byPost?.[postKey(postType, postId)]?.items || [];

export const selectThreadStatus = (state, postType, postId) =>
    state.comments?.byPost?.[postKey(postType, postId)]?.status || 'idle';

export const selectThreadError = (state, postType, postId) =>
    state.comments?.byPost?.[postKey(postType, postId)]?.error || null;

/* -------------------------------- Exports ------------------------------- */

export const { setThread, clearThread } = commentsSlice.actions;
export default commentsSlice.reducer;
