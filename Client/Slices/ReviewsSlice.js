import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

const GRAPHQL_ENDPOINT = "http://10.0.0.24:5000/api/graphql";

// Thunk to retrieve reviews by placeId
export const fetchReviewsByPlaceId = createAsyncThunk(
  "reviews/fetchByPlaceId",
  async (placeId, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `http://10.0.0.24:5000/api/reviews/${placeId}`
      );
      return response.data.reviews; // Return the reviews array
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to fetch reviews by placeId";
      return rejectWithValue(errorMessage);
    }
  }
);

// Thunk to delete a review by user email and object ID
export const deleteReview = createAsyncThunk(
  "reviews/deleteReview",
  async ({ placeId, reviewId }, { rejectWithValue }) => {
    try {
      const response = await axios.delete(
        `http://10.0.0.24:5000/api/reviews/${placeId}/${reviewId}`
      );
      return response.data.reviews; // Return the updated reviews list
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to delete review";
      return rejectWithValue(errorMessage);
    }
  }
);

// Thunk to create a new review for a business
export const createReview = createAsyncThunk(
  "reviews/createReview",
  async ({ placeId, businessName, userId, rating, reviewText, date, fullName, photos}, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `http://10.0.0.24:5000/api/reviews/${placeId}`,
        {
            businessName,
            fullName,
            userId,
            rating,
            reviewText,
            date,
            photos,
            
        }
      );
      return response.data.review; // Return the newly created review
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to create review";
      return rejectWithValue(errorMessage);
    }
  }
);

export const toggleLike = createAsyncThunk(
    'reviews/toggleLike',
    async ({ placeId, reviewId, userId, fullName }, { rejectWithValue }) => {
      try {
        const response = await axios.post(
          `http://10.0.0.24:5000/api/reviews/${placeId}/${reviewId}/like`,
          { userId, fullName }
        );
        console.log(`Likes count for review ${reviewId}:`, response.data.likes.length);
        return { reviewId, likes: response.data.likes };
      } catch (error) {
        return rejectWithValue(error.response?.data?.message || 'Failed to toggle like');
      }
    }
);

export const addComment = createAsyncThunk(
    'reviews/addComment',
    async ({ placeId, reviewId, userId, fullName, commentText }, { rejectWithValue }) => {
      try {
        const response = await axios.post(
          `http://10.0.0.24:5000/api/reviews/${placeId}/${reviewId}/comment`,
          { userId, commentText, fullName }
        );
        return { reviewId, comments: response.data.comments };
      } catch (error) {
        return rejectWithValue(error.response?.data?.message || 'Failed to add comment');
      }
    }
);

// Add a reply to a specific comment
export const addReply = createAsyncThunk(
    'reviews/addReply',
    async ({ placeId, reviewId, commentId, userId, fullName, commentText }, { rejectWithValue }) => {
        try {
            const response = await axios.post(
                `http://10.0.0.24:5000/api/reviews/${placeId}/${reviewId}/${commentId}/reply`,
                { userId, fullName, commentText }
            );
            console.log('Backend response:', response.data);
            return { reviewId, commentId, replies: response.data.replies };
        } catch (error) {
            console.error('Error in thunk:', error.response?.data || error.message);
            return rejectWithValue(error.response?.data || 'Error adding reply');
        }
    }
);

export const fetchReviewsByUserId = createAsyncThunk(
  'reviews/fetchReviewsByUserId',
  async (userId, { rejectWithValue }) => {
    try {
      const query = `
        query GetUserReviews($userId: String!) {
          getUserReviews(userId: $userId) {
            _id
            businessName
            placeId
            userId
            fullName
            rating
            reviewText
            date
            likes {
              userId
              fullName
            }
            comments {
              _id
              commentText
              userId
              fullName
              date
              replies {
                _id
                commentText
                userId
                fullName
                date
              }
            }
            profilePic {
              _id
              photoKey
              uploadedBy
              description
              tags
              uploadDate
            }
            profilePicUrl
            photos {  # ✅ Added photos field
              _id
              photoKey
              uploadedBy
              description
              tags
              uploadDate
              url  # ✅ Added pre-signed URL for displaying photos
            }
          }
        }
      `;

      // Make GraphQL request
      const response = await axios.post(GRAPHQL_ENDPOINT, {
        query,
        variables: { userId },
      });

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      return response.data.data.getUserReviews;

    } catch (error) {
      return rejectWithValue(error.message || "Failed to fetch reviews via GraphQL");
    }
  }
)

// ✅ GraphQL Thunk to Fetch User & Friends Reviews
export const fetchReviewsByUserAndFriends = createAsyncThunk(
  "reviews/fetchByUserAndFriends",
  async (userId, { rejectWithValue }) => {
    try {
      const query = `
        query GetUserAndFriendsReviews($userId: String!) {
          getUserAndFriendsReviews(userId: $userId) {
            _id
            businessName
            placeId
            userId
            fullName
            rating
            reviewText
            date
            likes {
              userId
              fullName
            }
            comments {
              _id
              commentText
              userId
              fullName
              date
              replies {
                _id
                commentText
                userId
                fullName
                date
              }
            }
            profilePic {
              _id
              photoKey
              uploadedBy
              description
              tags
              uploadDate
            }
            profilePicUrl
            photos {  # ✅ Added photos field
              _id
              photoKey
              uploadedBy
              description
              tags
              uploadDate
              url  # ✅ Added pre-signed URL for displaying photos
            }
          }
        }
      `;

      // Make GraphQL request
      const response = await axios.post(GRAPHQL_ENDPOINT, {
        query,
        variables: { userId },
      });

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      return response.data.data.getUserAndFriendsReviews;
    } catch (error) {
      return rejectWithValue(error.message || "Failed to fetch reviews via GraphQL");
    }
  }
);

export const fetchReviewsByOtherUserId = createAsyncThunk(
  'reviews/fetchReviewsByOtherUserId',
  async (userId, { rejectWithValue }) => {
    try {
      const query = `
        query GetUserReviews($userId: String!) {
          getUserReviews(userId: $userId) {
            _id
            businessName
            placeId
            userId
            fullName
            rating
            reviewText
            date
            likes {
              userId
              fullName
            }
            comments {
              _id
              commentText
              userId
              fullName
              date
              replies {
                _id
                commentText
                userId
                fullName
                date
              }
            }
            profilePic {
              _id
              photoKey
              uploadedBy
              description
              tags
              uploadDate
            }
            profilePicUrl
          }
        }
      `;

      // Make GraphQL request
      const response = await axios.post(GRAPHQL_ENDPOINT, {
        query,
        variables: { userId },
      });

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      return response.data.data.getUserReviews;

    } catch (error) {
      return rejectWithValue(error.message || "Failed to fetch reviews via GraphQL");
    }
  }
)

// Reviews slice
const reviewsSlice = createSlice({
  name: "reviews",
  initialState: {
    businessReviews: [],
    localReviews: [],
    profileReviews: [],
    otherUserReviews: [],
    userAndFriendsReviews: [],
    loading: "idle",
    error: null,
  },
  reducers: {
    resetProfileReviews: (state) => {
      state.profileReviews = [];
      state.loading = "idle";
      state.error = null;
    },
    setLocalReviews: (state, action) => {
        state.localReviews = action.payload;
    },
    resetOtherUserReviews: (state) => {
      state.otherUserReviews = [];
    },
    resetBusinessReviews: (state) => {
      state.businessReviews = [];
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch reviews by user email
      .addCase(fetchReviewsByUserId.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(fetchReviewsByUserId.fulfilled, (state, action) => {
        state.loading = "idle";
        state.profileReviews = action.payload;
      })
      .addCase(fetchReviewsByUserId.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      .addCase(fetchReviewsByOtherUserId.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(fetchReviewsByOtherUserId.fulfilled, (state, action) => {
        state.loading = "idle";
        state.otherUserReviews = action.payload;
      })
      .addCase(fetchReviewsByOtherUserId.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      // Fetch reviews by placeId
      .addCase(fetchReviewsByPlaceId.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(fetchReviewsByPlaceId.fulfilled, (state, action) => {
        state.loading = "idle";
        state.businessReviews = action.payload;
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
        state.loading = "idle";
        state.reviews = action.payload; // Update reviews after deletion
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
      })
      .addCase(createReview.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      .addCase(toggleLike.fulfilled, (state, action) => {
        const { reviewId, likes } = action.payload;
      
        // Update `reviews` state
        state.profileReviews = state.profileReviews.map((review) =>
          review._id === reviewId ? { ...review, likes } : review
        );
      
        // Update `localReviews` state (if applicable)
        state.userAndFriendsReviews = state.userAndFriendsReviews.map((review) =>
          review._id === reviewId ? { ...review, likes } : review
        );

        state.otherUserReviews = state.otherUserReviews.map((review) =>
          review._id === reviewId ? { ...review, likes } : review
        );
      })
      .addCase(addComment.fulfilled, (state, action) => {
        const { reviewId, comments } = action.payload; // Ensure `comments` includes the new comment
        const otherUserReviews = state.otherUserReviews.find((review) => review._id === reviewId);
        const reviewUserFriends = state.userAndFriendsReviews.find((review) => review._id === reviewId);
        const profileReviews = state.profileReviews.find((review) => review._id === reviewId);
        if (otherUserReviews) {
            // Push the new comment to the existing comments array
            otherUserReviews.comments = [...otherUserReviews.comments, ...comments];
        }
        if (reviewUserFriends) {
          // Push the new comment to the existing comments array
          reviewUserFriends.comments = [...reviewUserFriends.comments, ...comments];
        }
        if (profileReviews) {
          // Push the new comment to the existing comments array
          profileReviews.comments = [...profileReviews.comments, ...comments];
        }
      })
      .addCase(addReply.pending, (state) => {
        state.loading = true;
      })
      .addCase(addReply.fulfilled, (state, action) => {
        const { reviewId, commentId, replies } = action.payload;
        const userAndFriendsReviews = state.userAndFriendsReviews.find((r) => r._id === reviewId);
        const otherUserReviews = state.otherUserReviews.find((r) => r._id === reviewId);
        const profileReviews = state.profileReviews.find((r) => r._id === reviewId);
        if (userAndFriendsReviews) {
          const comment = userAndFriendsReviews.comments.find((c) => c._id === commentId);
          if (comment) {
            comment.replies = replies; // Update replies with the latest from the backend
          }
        }
        if (otherUserReviews) {
          const comment = otherUserReviews.comments.find((c) => c._id === commentId);
          if (comment) {
            comment.replies = replies; // Update replies with the latest from the backend
          }
        }
        if (profileReviews) {
          const comment = profileReviews.comments.find((c) => c._id === commentId);
          if (comment) {
            comment.replies = replies; // Update replies with the latest from the backend
          }
        }
        state.loading = false;
      })
      .addCase(addReply.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // ✅ Fetch User + Friends Reviews (GraphQL API)
      .addCase(fetchReviewsByUserAndFriends.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(fetchReviewsByUserAndFriends.fulfilled, (state, action) => {
        state.loading = "idle";
        state.userAndFriendsReviews = action.payload;
      })
      .addCase(fetchReviewsByUserAndFriends.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      });
          
  },
});

export default reviewsSlice.reducer;

export const { resetProfileReviews, setLocalReviews, resetOtherUserReviews, resetBusinessReviews } = reviewsSlice.actions;

export const selectProfileReviews = (state) => state.reviews.profileReviews;
export const selectBusinessReviews = (state) => state.reviews.busienssReviews;
export const selectOtherUserReviews = (state) => state.reviews.otherUserReviews;
export const selectLoading = (state) => state.reviews.loading;
export const selectError = (state) => state.reviews.error;
export const selectLocalReviews = (state) => state.reviews.localReviews;
export const selectUserAndFriendsReviews = (state) => state.reviews.userAndFriendsReviews;
