import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

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
      console.error("❌ Error in fetchDining:", err.message || err);
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

export const fetchNearbyPromosAndEvents = createAsyncThunk(
  'GooglePlaces/fetchNearbyPromosAndEvents',
  async ({ lat, lng }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/places2/events-and-promos-nearby`, { lat, lng });

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
    updateNearbySuggestionCommentOrReply: (state, action) => {
      const { postId, commentId, updatedComment } = action.payload;
      const suggestion = state.nearbySuggestions.find(s => s._id === postId);
      if (!suggestion?.comments) return;

      const updateCommentById = (comments) => {
        for (let i = 0; i < comments.length; i++) {
          if (comments[i]._id === commentId) {
            comments[i] = { ...comments[i], ...updatedComment };
            return true;
          }
          if (comments[i].replies && updateCommentById(comments[i].replies)) {
            return true;
          }
        }
        return false;
      };

      updateCommentById(suggestion.comments);
    },
    addNearbySuggestionComment: (state, action) => {
      const { postId, newComment } = action.payload;
      const suggestion = state.nearbySuggestions.find(s => s._id === postId);
      if (suggestion) {
        suggestion.comments = suggestion.comments || [];
        suggestion.comments.push(newComment);
      }
    },
    addNearbySuggestionReply: (state, action) => {
      const { postId, commentId, newReply } = action.payload;
      console.log("📥 Action payload received in addNearbySuggestionReply:", { postId, commentId, newReply });

      const suggestion = state.nearbySuggestions.find(s => s._id === postId);
      if (!suggestion) {
        console.warn(`❌ No suggestion found with postId: ${postId}`);
        return;
      }

      if (!suggestion.comments) {
        console.warn(`⚠️ Suggestion with postId ${postId} has no comments array.`);
        return;
      }

      const insertReply = (comments, depth = 0) => {
        for (let i = 0; i < comments.length; i++) {
          const comment = comments[i];
          console.log(`${' '.repeat(depth * 2)}🔍 Checking comment ${comment._id}`);

          if (comment._id === commentId) {
            console.log(`${' '.repeat(depth * 2)}✅ Found comment ${commentId}. Inserting reply.`);
            comment.replies = comment.replies || [];
            comment.replies.push(newReply);
            console.log(`${' '.repeat(depth * 2)}📝 New replies array:`, comment.replies);
            return true;
          }

          if (comment.replies && comment.replies.length > 0) {
            console.log(`${' '.repeat(depth * 2)}🔁 Searching nested replies for comment ${comment._id}`);
            if (insertReply(comment.replies, depth + 1)) return true;
          }
        }
        return false;
      };

      const inserted = insertReply(suggestion.comments);
      if (!inserted) {
        console.warn(`❌ Could not find comment with ID ${commentId} to insert reply into.`);
      } else {
        console.log("✅ Reply successfully inserted into state.");
      }
    },
    removeNearbySuggestionCommentOrReply: (state, action) => {
      const { postId, commentId } = action.payload;
      const suggestion = state.nearbySuggestions.find(s => s._id === postId);
      if (!suggestion?.comments) return;

      const removeById = (comments) => {
        for (let i = 0; i < comments.length; i++) {
          if (comments[i]._id === commentId) {
            comments.splice(i, 1);
            return true;
          }
          if (comments[i].replies && removeById(comments[i].replies)) return true;
        }
        return false;
      };

      removeById(suggestion.comments);
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
  updateNearbySuggestionCommentOrReply,
  addNearbySuggestionComment,
  addNearbySuggestionReply,
  removeNearbySuggestionCommentOrReply,
  updateNearbySuggestionLikes,
} = GooglePlacesSlice.actions;

export const selectGooglePlaces = (state) => state.GooglePlaces.curatedPlaces || [];
export const selectGoogleStatus = (state) => state.GooglePlaces.status;
export const selectNearbySuggestions = state => state.GooglePlaces.nearbySuggestions || [];
export const selectNearbySuggestionById = (state, id) =>
  state.GooglePlaces.nearbySuggestions.find(item => item._id === id);

export default GooglePlacesSlice.reducer;
