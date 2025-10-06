import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { GET_USER_ACTIVITY_QUERY } from "./GraphqlQueries/Queries/getUserActivity";
import { GET_USER_POSTS_QUERY } from "./GraphqlQueries/Queries/getUserPosts";
import { GET_BUSINESS_REVIEWS_QUERY } from "./GraphqlQueries/Queries/getBusinessReviews";
import { updatePostCollections } from "../utils/posts/UpdatePostCollections";
import { createSelector } from "@reduxjs/toolkit";
import client from "../apolloClient";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

// Thunk to delete a review by user email and object ID
export const deleteReview = createAsyncThunk(
  "reviews/deleteReview",
  async ({ placeId, reviewId }, { rejectWithValue }) => {
    try {
      const response = await axios.delete(
        `${BASE_URL}/reviews/${placeId}/${reviewId}`
      );
      return response.data; // Return the updated reviews list
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to delete review";
      return rejectWithValue(errorMessage);
    }
  }
);

export const createReview = createAsyncThunk(
  "reviews/createReview",
  async ({ placeId, businessName, userId, rating, priceRating, serviceRating, atmosphereRating, wouldRecommend, reviewText, date, fullName, photos, taggedUsers, location }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/reviews/${placeId}`, {
        businessName,
        fullName,
        userId,
        rating,
        priceRating,
        serviceRating,
        atmosphereRating,
        wouldRecommend,
        reviewText,
        date,
        photos,
        taggedUsers,
        location,
      });

      return response.data.review;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to create review";
      return rejectWithValue(errorMessage);
    }
  }
);

export const fetchReviewsByUserId = createAsyncThunk(
  'reviews/fetchReviewsByUserId',
  async ({ userId, limit = 15, after }, { rejectWithValue }) => {
    try {
      const variables = { userId, limit, after };

      const { data, errors } = await client.query({
        query: GET_USER_POSTS_QUERY,
        variables,
        fetchPolicy: 'network-only', // optional, use if you want fresh data every time
      });

      if (errors?.length) {
        return rejectWithValue(errors.map(err => err.message).join('; '));
      }

      const posts = data?.getUserPosts;

      if (!Array.isArray(posts)) {
        return [];
      }

      return posts;
    } catch (error) {
      return rejectWithValue(
        error.graphQLErrors?.map(e => e.message).join('; ') ||
        error.networkError?.message ||
        error.message ||
        'Failed to fetch posts via GraphQL'
      );
    }
  }
);

export const fetchPostsByOtherUserId = createAsyncThunk(
  'reviews/fetchReviewsByOtherUserId',
  async ({ userId, limit, after }, { rejectWithValue }) => {
    try {
      const variables = { userId, limit, after };

      const { data, errors } = await client.query({
        query: GET_USER_POSTS_QUERY,
        variables,
        fetchPolicy: 'network-only', // Optional: avoids stale cache
      });

      if (errors?.length) {
        console.error('❌ GraphQL errors:', errors);
        return rejectWithValue(errors.map(err => err.message).join('; '));
      }

      const posts = data?.getUserPosts || [];
      return posts;

    } catch (error) {
      console.error('❗ Apollo client error:', {
        message: error.message,
        graphQLErrors: error.graphQLErrors,
        networkError: error.networkError,
      });

      return rejectWithValue(
        error.graphQLErrors?.map(e => e.message).join('; ') ||
        error.networkError?.message ||
        error.message ||
        'Failed to fetch posts via GraphQL'
      );
    }
  }
);

export const fetchReviewsByUserAndFriends = createAsyncThunk(
  "reviews/fetchUserActivity",
  async ({ userId, limit = 15, after, userLat, userLng }, { rejectWithValue }) => {
    try {
      const { data, errors } = await client.query({
        query: GET_USER_ACTIVITY_QUERY,
        variables: { userId, limit, after, userLat, userLng },
        fetchPolicy: 'network-only', // optional: avoids caching issues
      });

      if (errors?.length) {
        console.error("❌ GraphQL errors:", errors);
        throw new Error(errors.map(err => err.message).join("; "));
      }

      if (!data?.getUserActivity) {
        throw new Error("GraphQL response did not return expected data.");
      }

      return data.getUserActivity;
    } catch (error) {
      console.error("❗ Apollo client error:", {
        message: error.message,
        name: error.name,
        networkError: error.networkError,
        graphQLErrors: error.graphQLErrors,
      });

      return rejectWithValue(error.message || "Failed to fetch user activity via GraphQL");
    }
  }
);

export const fetchPostById = createAsyncThunk(
  'reviews/fetchReviewById',
  async ({ postType, postId }, { rejectWithValue }) => {
    try {
      const res = await axios.get(`${BASE_URL}/reviews/${postType}/${postId}`);
      // success shape stays the same: { placeId, businessName, review }
      return res.data;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        // 🔇 suppress logs for 404
        return rejectWithValue({ status: 404, message: 'Not Found' });
      }
      if (__DEV__) console.error('[fetchPostById]', err);
      return rejectWithValue({
        status: status ?? 0,
        message: err?.response?.data?.message || err?.message || 'Failed to fetch review',
      });
    }
  }
);

export const fetchReviewsByPlaceId = createAsyncThunk(
  'reviews/fetchReviewsByPlaceId',
  async ({ placeId, limit = 10, after = null }, { rejectWithValue }) => {
    try {
      const { data, errors } = await client.query({
        query: GET_BUSINESS_REVIEWS_QUERY,
        variables: { placeId, limit, after },
      });

      if (errors) {
        throw new Error(errors[0].message);
      }

      return data.getBusinessReviews;
    } catch (error) {
      return rejectWithValue(error.message || "Failed to fetch reviews via GraphQL");
    }
  }
);

export const editReview = createAsyncThunk(
  'reviews/editReview',
  async ({ placeId, reviewId, rating, priceRating, serviceRating, atmosphereRating, wouldRecommend, reviewText, taggedUsers, photos }, thunkAPI) => {
    try {
      const response = await axios.put(`${BASE_URL}/reviews/${placeId}/${reviewId}`, {
        rating,
        priceRating,
        serviceRating,
        atmosphereRating,
        wouldRecommend,
        reviewText,
        taggedUsers,
        photos,
      });

      return response.data.review; // You can return the whole response if needed
    } catch (error) {
      console.error('Error editing review:', error);
      return thunkAPI.rejectWithValue(error.response?.data?.message || 'Failed to edit review');
    }
  }
);

// Reviews slice
const reviewsSlice = createSlice({
  name: "reviews",
  initialState: {
    businessReviews: [],
    localReviews: [],
    profileReviews: [],
    otherUserReviews: [],
    userAndFriendsReviews: [],
    suggestedPosts: [],
    hasFetchedOnce: false,
    selectedReview: null,
    loading: "idle",
    error: null,
  },
  reducers: {
    updateSharedPostInReviews: (state, action) => {
      const { postId, updates } = action.payload;

      updatePostCollections({
        state,
        postId,
        updates,
        postKeys: [
          "userAndFriendsReviews",
          "profileReviews",
          "otherUserReviews",
          "businessReviews",
          "suggestedPosts"
        ],
      });
    },
    resetProfileReviews: (state) => {
      state.profileReviews = [];
      state.loading = "idle";
      state.error = null
    },
    setSuggestedPosts: (state, action) => {
      state.suggestedPosts = action.payload;
    },
    setHasFetchedOnce: (state, action) => {
      state.hasFetchedOnce = action.payload;
    },
    resetOtherUserReviews: (state) => {
      state.otherUserReviews = [];
    },
    resetBusinessReviews: (state) => {
      state.businessReviews = [];
    },
    clearSelectedReview: (state) => {
      state.selectedReview = null;
      state.error = null;
    },
    setUserAndFriendsReviews: (state, action) => {
      state.userAndFriendsReviews = [...action.payload]; // ✅ new array reference
    },
    appendUserAndFriendsReviews: (state, action) => {
      state.userAndFriendsReviews = [
        ...state.userAndFriendsReviews,
        ...action.payload,
      ]; // for pagination
    },
    appendProfileReviews: (state, action) => {
      state.profileReviews = [
        ...state.profileReviews,
        ...action.payload,
      ]; // for pagination
    },
    appendOtherUserReviews: (state, action) => {
      state.otherUserReviews = [
        ...state.otherUserReviews,
        ...action.payload,
      ]; // for pagination
    },
    appendBusinessReviews: (state, action) => {
      state.businessReviews = [
        ...state.businessReviews,
        ...action.payload,
      ]; // for pagination
    },
    setProfileReviews: (state, action) => {
      state.profileReviews = [...action.payload];
    },
    setBusinessReviews: (state, action) => {
      state.businessReviews = [...action.payload]
    },
    setOtherUserReviews: (state, action) => {
      state.otherUserReviews = [...action.payload];
    },
    setSelectedReview: (state, action) => {
      state.selectedReview = action.payload;
    },
    addPostToFeeds: (state, action) => {
      const newPost = action.payload;
      const newId = newPost?._id || newPost?.id;

      const upsert = (arr) => {
        if (!Array.isArray(arr)) return;
        const idx = arr.findIndex(p => (p?._id || p?.id) === newId);
        if (idx !== -1) {
          // Replace existing (immer lets us mutate)
          arr[idx] = { ...arr[idx], ...newPost };
        } else {
          arr.unshift(newPost);
        }
      };

      upsert(state.profileReviews);
      upsert(state.userAndFriendsReviews);
    },
    updatePostInReviewState: (state, action) => {
      const updatedPost = action.payload;

      const updateInArray = (array) => {
        const index = array.findIndex(post => post._id === updatedPost._id);
        if (index !== -1) {
          array[index] = updatedPost;
        }
      };

      updateInArray(state.userAndFriendsReviews);
      updateInArray(state.profileReviews);
      updateInArray(state.otherUserReviews);
      updateInArray(state.businessReviews);
      updateInArray(state.suggestedPosts);
    },
    resetAllReviews: (state) => {
      state.profileReviews = [];
      state.userAndFriendsReviews = [];
      state.otherUserReviews = [];
      state.businessReviews = [];
    },
    applyPostUpdates(state, action) {
      const { postId, updates = {}, postKeys = [] } = action?.payload || {};
      if (!postId) return;

      try {
        updatePostCollections({ state, postId, updates, postKeys });
      } catch (e) {
        // keep propagating so your crash logger can still catch it
        throw e;
      }
    },
    applyBulkPostUpdates(state, action) {
      const items = Array.isArray(action.payload) ? action.payload : [];
      for (const { postId, updates = {}, postKeys = [] } of items) {
        if (!postId || !updates) continue;
        updatePostCollections({ state, postId, updates, postKeys });
      }
    },
    removePostFromFeeds: (state, action) => {
      const postId = action?.payload?.postId ?? action?.payload;
      if (!postId) return;

      const notThisPost = (p) => (p?._id || p?.id) !== postId;

      state.userAndFriendsReviews = (state.userAndFriendsReviews || []).filter(notThisPost);
      state.profileReviews = (state.profileReviews || []).filter(notThisPost);
    },
    replacePostInFeeds: (state, action) => {
      const updatedPost = action.payload;
      if (!updatedPost?._id && !updatedPost?.id) return;

      const matchId = updatedPost._id || updatedPost.id;

      const updateArray = (arr) =>
        (arr || []).map((item) =>
          (item?._id || item?.id) === matchId ? updatedPost : item
        );

      state.userAndFriendsReviews = updateArray(state.userAndFriendsReviews);
      state.profileReviews = updateArray(state.profileReviews);
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch reviews by user email
      .addCase(fetchReviewsByUserId.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(fetchReviewsByUserId.fulfilled, (state) => {
        state.loading = "idle";
      })
      .addCase(fetchReviewsByUserId.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      .addCase(fetchPostsByOtherUserId.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(fetchPostsByOtherUserId.fulfilled, (state) => {
        state.loading = "idle";
      })
      .addCase(fetchPostsByOtherUserId.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      // Fetch reviews by placeId
      .addCase(fetchReviewsByPlaceId.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(fetchReviewsByPlaceId.fulfilled, (state) => {
        state.loading = "idle";
      })
      .addCase(fetchReviewsByPlaceId.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      // Delete review
      .addCase(deleteReview.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(deleteReview.fulfilled, (state, action) => {
        const deletedReviewId = action.meta.arg.reviewId;

        state.loading = "idle";

        // If you're storing a centralized list of reviews
        state.reviews = (state.reviews || []).filter(r => r._id !== deletedReviewId);

        // Remove from user & friends feed
        state.userAndFriendsReviews = (state.userAndFriendsReviews || []).filter(
          (r) => r._id !== deletedReviewId
        );

        // Remove from current user's profile feed
        state.profileReviews = (state.profileReviews || []).filter(
          (r) => r._id !== deletedReviewId
        );

        // Remove from other user's profile feed
        state.otherUserReviews = (state.otherUserReviews || []).filter(
          (r) => r._id !== deletedReviewId
        );
      })
      .addCase(deleteReview.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      // Create review
      .addCase(createReview.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(createReview.fulfilled, (state, action) => {
        state.loading = "idle";
        // Ensure state.userAndFriendsReviews is initialized
        if (!Array.isArray(state.userAndFriendsReviews)) {
          state.userAndFriendsReviews = [];
        }
        state.userAndFriendsReviews = [action.payload, ...state.userAndFriendsReviews];
        state.profileReviews = [action.payload, ...state.profileReviews];
      })
      .addCase(createReview.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      .addCase(fetchReviewsByUserAndFriends.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(fetchReviewsByUserAndFriends.fulfilled, (state, action) => {
        state.loading = "idle";
        //state.userAndFriendsReviews = action.payload;
      })
      .addCase(fetchReviewsByUserAndFriends.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      .addCase(fetchPostById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPostById.fulfilled, (state, action) => {
        state.selectedReview = action.payload;
        state.loading = false;
      })
      .addCase(fetchPostById.rejected, (state, action) => {
        state.error = action.payload;
        state.loading = false;
      })
      .addCase(editReview.pending, (state) => {
        state.loading = "loading";
        state.error = null;
      })
      .addCase(editReview.fulfilled, (state, action) => {
        const updatedReview = action.payload;
        state.loading = "succeeded";

        // Helper to update review in any given array
        const updateReviewArray = (array) => {
          const index = array.findIndex(r => r._id === updatedReview._id);
          if (index !== -1) {
            array[index] = updatedReview;
          }
        };

        updateReviewArray(state.userAndFriendsReviews);
        updateReviewArray(state.profileReviews);
        updateReviewArray(state.otherUserReviews);
        updateReviewArray(state.businessReviews);
        updateReviewArray(state.suggestedPosts);
      })
      .addCase(editReview.rejected, (state, action) => {
        state.loading = "failed";
        state.error = action.payload || "Error editing review";
      })
  },
});

export default reviewsSlice.reducer;

export const {
  setUserAndFriendsReviews,
  setBusinessReviews,
  appendBusinessReviews,
  setOtherUserReviews,
  appendOtherUserReviews,
  appendUserAndFriendsReviews,
  appendProfileReviews,
  setSelectedReview,
  setProfileReviews,
  addCheckInUserAndFriendsReviews,
  addCheckInProfileReviews,
  resetProfileReviews,
  resetOtherUserReviews,
  resetBusinessReviews,
  clearSelectedReview,
  resetAllReviews,
  setHasFetchedOnce,
  setSuggestedPosts,
  updatePostInReviewState,
  updateReviewFieldsById,
  updateSharedPostInReviews,
  applyPostUpdates,
  applyBulkPostUpdates,
  addPostToFeeds,
  removePostFromFeeds,
  replacePostInFeeds,
} = reviewsSlice.actions;

export const selectAllPosts = createSelector(
  [
    (state) => state.reviews.businessReviews || [],
    (state) => state.reviews.userAndFriendsReviews || [],
    (state) => state.reviews.otherUserReviews || [],
    (state) => state.reviews.profileReviews || [],
    (state) => state.reviews.suggestedPosts || [],
  ],
  (business, userAndFriends, otherUser, profile, suggested) => {
    // Order here sets precedence if the same id exists in multiple buckets
    return [
      ...business,
      ...userAndFriends,
      ...otherUser,
      ...profile,
      ...suggested,
    ];
  }
);

export const selectProfileReviews = (state) => state.reviews.profileReviews || [];
export const selectHasFetchedOnce = state => state.reviews.hasFetchedOnce;
export const selectBusinessReviews = (state) => state.reviews.businessReviews || [];
export const selectOtherUserReviews = (state) => state.reviews.otherUserReviews || [];
export const selectLoading = (state) => state.reviews.loading;
export const selectError = (state) => state.reviews.error;
export const selectLocalReviews = (state) => state.reviews.localReviews || [];
export const selectUserAndFriendsReviews = (state) => state.reviews.userAndFriendsReviews || [];
export const selectSelectedReview = (state) => state.reviews.selectedReview;
export const selectSuggestedPosts = state => state.reviews.suggestedPosts;
export const selectPostById = createSelector(
  [selectAllPosts, (_state, reviewId) => reviewId],
  (allPosts, reviewId) =>
    allPosts.find((p) => (p?._id || p?.id) === reviewId) || null
);
