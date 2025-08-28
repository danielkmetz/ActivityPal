import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getUserToken } from '../functions';
import { pushSharedPostToProfileReviews, pushSharedPostToUserAndFriends } from './ReviewsSlice';
import { updateSharedPostInReviews } from './ReviewsSlice';
import { getAuthHeaders } from '../utils/Authorization/getAuthHeaders';
import axios from 'axios';

// 🔐 Base config
const API_BASE = `${process.env.EXPO_PUBLIC_SERVER_URL}/sharedPosts`;

// Create a shared post
export const createSharedPost = createAsyncThunk(
  'sharedPosts/create',
  async ({ postType, originalPostId, caption }, { dispatch, rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();

      const res = await axios.post(API_BASE, { postType, originalPostId, caption }, config);
      const sharedPost = res.data;

      dispatch(pushSharedPostToUserAndFriends(sharedPost));
      dispatch(pushSharedPostToProfileReviews(sharedPost));

      return sharedPost;
    } catch (err) {
      console.error('❌ Error creating shared post:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to create shared post' });
    }
  }
);

export const toggleLikeOnSharedPost = createAsyncThunk(
  'sharedPosts/toggleLike',
  async ({ postId, userId, fullName }, { dispatch, rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();
      const res = await axios.post(`${API_BASE}/${postId}/like`, {
        userId,
        fullName,
      }, config);

      const updatedLikes = res.data.likes;

      dispatch(updateSharedPostInReviews({
        postId,
        updates: {
          __updatePostLikes: updatedLikes,
        },
      }));

      return { postId, likes: updatedLikes };
    } catch (err) {
      console.error('❌ Error toggling like on shared post:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to toggle like' });
    }
  }
);

// Get a shared post by ID
export const fetchSharedPostById = createAsyncThunk(
  'sharedPosts/fetchById',
  async (sharedPostId, { rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();

      const res = await axios.get(`${API_BASE}/${sharedPostId}`, config);
      return res.data;
    } catch (err) {
      console.error('❌ Error fetching shared post by ID:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to fetch shared post' });
    }
  }
);

// Get shared posts by user
export const fetchSharedPostsByUser = createAsyncThunk(
  'sharedPosts/fetchByUser',
  async (userId, { rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();

      const res = await axios.get(`${API_BASE}/by-user/${userId}`, config);
      return res.data;
    } catch (err) {
      console.error('❌ Error fetching shared posts by user:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to fetch shared posts' });
    }
  }
);

// Delete a shared post
export const deleteSharedPost = createAsyncThunk(
  'sharedPosts/delete',
  async (sharedPostId, { rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();

      await axios.delete(`${API_BASE}/${sharedPostId}`, config);
      return sharedPostId;
    } catch (err) {
      console.error('❌ Error deleting shared post:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to delete shared post' });
    }
  }
);

export const editSharedPost = createAsyncThunk(
  'sharedPosts/editSharedPost',
  async ({ sharedPostId, caption }, { dispatch, rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();
      const { data } = await axios.put(`${API_BASE}/${sharedPostId}`, { caption }, config);

      // Mirror the change into the reviews collections
      dispatch(
        updateSharedPostInReviews({
          postId: data._id,
          updates: { caption: data.caption },
        })
      );

      return data;
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || 'Failed to edit shared post');
    }
  }
);

const sharedPostsSlice = createSlice({
  name: 'sharedPosts',
  initialState: {
    byId: {},
    userPosts: [],
    loading: false,
    error: null,
  },
  reducers: {
    resetSharedPostsState: (state) => {
      state.byId = {};
      state.userPosts = [];
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createSharedPost.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createSharedPost.fulfilled, (state, action) => {
        state.loading = false;
        state.byId[action.payload._id] = action.payload;
        state.userPosts.unshift(action.payload); // optional: auto-prepend
      })
      .addCase(createSharedPost.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.error || 'Failed to create shared post';
      })
      .addCase(fetchSharedPostById.fulfilled, (state, action) => {
        state.byId[action.payload._id] = action.payload;
      })
      .addCase(fetchSharedPostsByUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSharedPostsByUser.fulfilled, (state, action) => {
        state.loading = false;
        state.userPosts = action.payload;
        action.payload.forEach((post) => {
          state.byId[post._id] = post;
        });
      })
      .addCase(fetchSharedPostsByUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.error || 'Failed to fetch shared posts';
      })
      .addCase(deleteSharedPost.fulfilled, (state, action) => {
        const id = action.payload;
        delete state.byId[id];
        state.userPosts = state.userPosts.filter((post) => post._id !== id);
      })
      .addCase(toggleLikeOnSharedPost.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(toggleLikeOnSharedPost.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(toggleLikeOnSharedPost.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.error || 'Failed to toggle like';
      })
      .addCase(editSharedPost.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(editSharedPost.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // Optional: keep a cache in this slice as well
        const idx = state.items.findIndex((p) => p._id === action.payload._id);
        if (idx !== -1) state.items[idx] = action.payload;
      })
      .addCase(editSharedPost.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to edit shared post';
      })
  },
})

// ✅ Exports
export const { resetSharedPostsState } = sharedPostsSlice.actions;
export default sharedPostsSlice.reducer;
