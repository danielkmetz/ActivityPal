import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getAuthHeaders } from '../utils/Authorization/getAuthHeaders';

const API = `${process.env.EXPO_PUBLIC_SERVER_URL}/likes`;

/**
 * Toggle like on a post (reviews, checkins, invites, promotions, events, sharedPosts, liveStreams)
 * @param {Object} args
 * @param {string} args.postType - e.g. 'reviews', 'promotions', 'events', 'liveStreams'
 * @param {string} args.postId   - MongoDB _id of the post
 */
export const toggleLike = createAsyncThunk(
  'likes/toggleLike',
  async ({ postType, postId }, { rejectWithValue }) => {
    try {
        console.log('postId in slice', postId);
      const auth = await getAuthHeaders();
      const url = `${API}/${postType}/${postId}/like`;
      const { data } = await axios.post(url, {}, auth); // body not needed (userId comes from token)
      return { postType, postId, data };
    } catch (err) {
      return rejectWithValue({
        postType,
        postId,
        error: err.response?.data || err.message,
      });
    }
  }
);

const likesSlice = createSlice({
  name: 'likes',
  initialState: {
    byPostId: {},  // keyed by `${postType}:${postId}`
    status: {},    // loading status keyed by `${postType}:${postId}`
    error: {},     // error messages keyed by `${postType}:${postId}`
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(toggleLike.pending, (state, action) => {
        const { postType, postId } = action.meta.arg;
        const key = `${postType}:${postId}`;
        state.status[key] = 'loading';
      })
      .addCase(toggleLike.fulfilled, (state, action) => {
        const { postType, postId, data } = action.payload;
        const key = `${postType}:${postId}`;
        state.status[key] = 'succeeded';
        state.byPostId[key] = {
          likes: data.likes || [],
          likesCount: data.likesCount || (data.likes ? data.likes.length : 0),
          liked: data.liked,
        };
        state.error[key] = null;
      })
      .addCase(toggleLike.rejected, (state, action) => {
        const { postType, postId, error } = action.payload;
        const key = `${postType}:${postId}`;
        state.status[key] = 'failed';
        state.error[key] = error;
      });
  },
});

export const selectLikesForPost = (state, postType, postId) =>
  state.likes.byPostId[`${postType}:${postId}`] || {
    likes: [],
    likesCount: 0,
    liked: false,
  };

export const selectLikeStatus = (state, postType, postId) =>
  state.likes.status[`${postType}:${postId}`] || 'idle';

export const selectLikeError = (state, postType, postId) =>
  state.likes.error[`${postType}:${postId}`] || null;

export default likesSlice.reducer;
