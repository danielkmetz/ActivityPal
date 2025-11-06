import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getAuthHeaders } from '../utils/Authorization/getAuthHeaders';

const API = `${process.env.EXPO_PUBLIC_SERVER_URL}/likes`;

/**
 * Toggle like on a unified Post by _id
 */
export const toggleLike = createAsyncThunk(
  'likes/toggleLike',
  async ({ postId }, { rejectWithValue }) => {
    try {
      const auth = await getAuthHeaders();
      const url = `${API}/${postId}/like`;
      const { data } = await axios.post(url, {}, auth);
      // Expecting: { likes, likesCount, liked, postId? }
      return {
        postId,
        likes: data.likes || [],
        likesCount:
          typeof data.likesCount === 'number'
            ? data.likesCount
            : Array.isArray(data.likes)
            ? data.likes.length
            : 0,
        liked: !!data.liked,
      };
    } catch (err) {
      return rejectWithValue({
        postId,
        error: err?.response?.data || err?.message || 'Unknown error',
      });
    }
  }
);

const likesSlice = createSlice({
  name: 'likes',
  initialState: {
    byPostId: {},  // postId -> { likes, likesCount, liked }
    status: {},    // postId -> 'idle' | 'loading' | 'succeeded' | 'failed'
    error: {},     // postId -> error payload
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(toggleLike.pending, (state, action) => {
        const { postId } = action.meta.arg || {};
        if (!postId) return;
        state.status[postId] = 'loading';
      })
      .addCase(toggleLike.fulfilled, (state, action) => {
        const { postId, likes, likesCount, liked } = action.payload;
        state.status[postId] = 'succeeded';
        state.byPostId[postId] = { likes, likesCount, liked };
        state.error[postId] = null;
      })
      .addCase(toggleLike.rejected, (state, action) => {
        const { postId, error } = action.payload || {};
        if (!postId) return;
        state.status[postId] = 'failed';
        state.error[postId] = error || 'Unknown error';
      });
  },
});

/* ---------- Selectors (unified) ---------- */
export const selectLikesForPost = (state, postId) =>
  state.likes.byPostId[postId] || { likes: [], likesCount: 0, liked: false };

export const selectLikeStatus = (state, postId) =>
  state.likes.status[postId] || 'idle';

export const selectLikeError = (state, postId) =>
  state.likes.error[postId] || null;

/* ---------- Backward-compat helpers (deprecated) ---------- */
export const selectLikesForPost_legacy = (state, _postType, postId) =>
  selectLikesForPost(state, postId);
export const selectLikeStatus_legacy = (state, _postType, postId) =>
  selectLikeStatus(state, postId);
export const selectLikeError_legacy = (state, _postType, postId) =>
  selectLikeError(state, postId);

export default likesSlice.reducer;
