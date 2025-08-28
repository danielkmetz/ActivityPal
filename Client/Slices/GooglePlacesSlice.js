import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { updateNearbySuggestions } from '../utils/posts/UpdateNearbySuggestions';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

export const insertReplyIntoComments = (comments, commentId, newReply) => {
  for (let comment of comments) {
    if (comment._id === commentId) {
      comment.replies = comment.replies || [];
      comment.replies.push(newReply);
      return true;
    }
    if (comment.replies && insertReplyIntoComments(comment.replies, commentId, newReply)) {
      return true;
    }
  }
  return false;
};

export const updateCommentById = (comments, commentId, updatedComment) => {
  for (let i = 0; i < comments.length; i++) {
    if (comments[i]._id === commentId) {
      comments[i] = updatedComment;
      return true;
    }
    if (comments[i].replies && updateCommentById(comments[i].replies, commentId, updatedComment)) {
      return true;
    }
  }
  return false;
};

export const removeCommentOrReplyById = (comments, commentId) => {
  for (let i = 0; i < comments.length; i++) {
    if (comments[i]._id === commentId) {
      comments.splice(i, 1);
      return true;
    }
    if (comments[i].replies && removeCommentOrReplyById(comments[i].replies, commentId)) {
      return true;
    }
  }
  return false;
};

export const fetchGooglePlaces = createAsyncThunk(
  'GooglePlaces/fetchGooglePlaces',
  async ({ lat, lng, activityType, quickFilter, radius, budget }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/places2/places-nearby`, {
        lat,
        lng,
        activityType,
        quickFilter,
        radius,
        budget,
      });
      return response.data.curatedPlaces;
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

// Thunk to fetch AI-curated places
export const fetchDining = createAsyncThunk(
  'GooglePlaces/fetchDining',
  async ({ lat, lng, activityType, radius, budget, isCustom }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/google/places`, {
        lat,
        lng,
        activityType,
        radius,
        budget,
        isCustom,
      });

      const curatedPlaces = response.data.curatedPlaces;

      // 🔍 Cuisine count breakdown logging
      const cuisineCounts = curatedPlaces.reduce((acc, place) => {
        const cuisine = place.cuisine || 'unknown';
        acc[cuisine] = (acc[cuisine] || 0) + 1;
        return acc;
      }, {});

      console.log("📊 Cuisine category breakdown from frontend:");
      Object.entries(cuisineCounts).forEach(([cuisine, count]) => {
        console.log(` - ${cuisine}: ${count}`);
      });

      return curatedPlaces;
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

export const fetchNearbyPromosAndEvents = createAsyncThunk(
  'GooglePlaces/fetchNearbyPromosAndEvents',
  async ({ lat, lng, userId }, { rejectWithValue }) => {
    try {
      console.log('suggestions being fetched')
      const response = await axios.post(`${BASE_URL}/places2/events-and-promos-nearby`, { lat, lng, userId });

      return response.data.suggestions;
    } catch (error) {
      console.error('Error fetching promos/events:', error);
      return rejectWithValue(error.response?.data || 'Unknown error');
    }
  }
);

const GooglePlacesSlice = createSlice({
  name: 'GooglePlaces',
  initialState: {
    curatedPlaces: [],
    nearbySuggestions: [],
    status: 'idle',
    error: null,
  },
  reducers: {
    clearGooglePlaces: (state) => {
      state.curatedPlaces = [];
      state.error = null;
    },
    clearNearbySuggestions: (state) => {
      state.nearbySuggestions = [];
    },
    updateNearbySuggestionLikes: (state, action) => {
      const { postId, likes } = action.payload;
      const index = state.nearbySuggestions.findIndex(s => s._id === postId);
      if (index !== -1) {
        state.nearbySuggestions[index].likes = likes;
      }
    },
    applyNearbyUpdates: (state, action) => {
      const { postId, updates, debug, label } = action.payload || {};
      if (!postId || !updates) return;
      updateNearbySuggestions({
        state,            // slice draft
        postId,
        updates,
        debug,
        label,
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGooglePlaces.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchGooglePlaces.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.curatedPlaces = action.payload;
      })
      .addCase(fetchGooglePlaces.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to fetch curated places';
      })
      .addCase(fetchDining.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to fetch curated places';
      })
      .addCase(fetchDining.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchDining.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.curatedPlaces = action.payload;
      })
      .addCase(fetchNearbyPromosAndEvents.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to fetch curated places';
      })
      .addCase(fetchNearbyPromosAndEvents.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchNearbyPromosAndEvents.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.nearbySuggestions = action.payload;
      })
  },
});

export const {
  clearGooglePlaces,
  clearNearbySuggestions,
  updateNearbySuggestionLikes,
  applyNearbyUpdates,
} = GooglePlacesSlice.actions;

export const selectGooglePlaces = (state) => state.GooglePlaces.curatedPlaces || [];
export const selectGoogleStatus = (state) => state.GooglePlaces.status;
export const selectNearbySuggestions = state => state.GooglePlaces.nearbySuggestions || [];
export const selectNearbySuggestionById = (state, id) =>
  state.GooglePlaces.nearbySuggestions.find(item => item._id === id);

export default GooglePlacesSlice.reducer;
