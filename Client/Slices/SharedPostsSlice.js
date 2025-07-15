import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

// 🔐 Base config
const API_BASE = `${process.env.EXPO_PUBLIC_SERVER_URL}/api/shared`;

// 🔄 Thunks

// Create a shared post
export const createSharedPost = createAsyncThunk(
  'sharedPosts/create',
  async ({ postType, originalPostId, caption }, { rejectWithValue }) => {
    try {
      const res = await axios.post(API_BASE, { postType, originalPostId, caption });
      return res.data;
    } catch (err) {
      console.error('❌ Error creating shared post:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to create shared post' });
    }
  }
);

// Get a shared post by ID
export const fetchSharedPostById = createAsyncThunk(
  'sharedPosts/fetchById',
  async (sharedPostId, { rejectWithValue }) => {
    try {
      const res = await axios.get(`${API_BASE}/${sharedPostId}`);
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
      const res = await axios.get(`${API_BASE}/by-user/${userId}`);
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
      await axios.delete(`${API_BASE}/${sharedPostId}`);
      return sharedPostId;
    } catch (err) {
      console.error('❌ Error deleting shared post:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to delete shared post' });
    }
  }
);

// 🧠 Slice
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
      });
  },
});

// ✅ Exports
export const { resetSharedPostsState } = sharedPostsSlice.actions;
export default sharedPostsSlice.reducer;
