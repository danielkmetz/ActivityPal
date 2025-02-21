import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const GRAPHQL_ENDPOINT = `${BASE_URL}/graphql`;

// Thunk to retrieve reviews by placeId
export const fetchReviewsByPlaceId = createAsyncThunk(
  "reviews/fetchByPlaceId",
  async (placeId, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/reviews/${placeId}`
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
        `${BASE_URL}/reviews/${placeId}/${reviewId}`
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
        `${BASE_URL}/reviews/${placeId}`,
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
          `${BASE_URL}/reviews/${placeId}/${reviewId}/like`,
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
          console.log("📤 Sending API request to add comment...", {
              placeId,
              reviewId,
              userId,
              fullName,
              commentText
          });

          const response = await axios.post(
              `${BASE_URL}/reviews/${placeId}/${reviewId}/comment`,
              { userId, commentText, fullName }
          );

          console.log("✅ API Response:", response.data);

          // ✅ Ensure we are correctly extracting the comment object
          if (!response.data.comment || !response.data.comment._id) {
              console.log("❌ API did not return a valid comment:", response.data);
              return rejectWithValue("Failed to add comment");
          }

          return {
              reviewId,
              commentId: response.data.comment._id, // ✅ Correctly extracting the commentId
              comments: [response.data.comment], // ✅ Wrap in an array to prevent reducer errors
          };
      } catch (error) {
          console.error("🚨 Error in addComment thunk:", error.response?.data || error.message);
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
              `${BASE_URL}/reviews/${placeId}/${reviewId}/${commentId}/reply`,
              { userId, fullName, commentText }
          );

          if (!response.data.reply || !response.data.reply._id) {
              return rejectWithValue("Failed to add reply");
          }

          return {
              reviewId,
              commentId,
              replyId: response.data.reply._id, 
              replies: [response.data.reply], 
              userId: response.data.parentCommentOwner, 
          };
      } catch (error) {
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
                replies {  
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
                    replies {  
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
                        replies {  
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
                            replies {  
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
                                replies {  
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
                                    replies {  
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
                                        replies {  
                                          _id
                                          commentText
                                          userId
                                          fullName
                                          date
                                          
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
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
            photos {  
              _id
              photoKey
              uploadedBy
              description
              tags
              uploadDate
              url  
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
        const { reviewId, comments } = action.payload;
        
        const updateComments = (review) => {
            if (review) {
                if (!Array.isArray(review.comments)) {
                    review.comments = []; // ✅ Ensure it's an array
                }
                review.comments.push(...comments); // ✅ Safely append the new comment
            }
        };
    
        updateComments(state.otherUserReviews.find((r) => r._id === reviewId));
        updateComments(state.userAndFriendsReviews.find((r) => r._id === reviewId));
        updateComments(state.profileReviews.find((r) => r._id === reviewId));
      })
      .addCase(addReply.pending, (state) => {
        state.loading = true;
      })
      .addCase(addReply.fulfilled, (state, action) => {
        const { reviewId, commentId, replies } = action.payload;
    
        const updateReplies = (comments) => {
            return comments.map((comment) => {
                if (comment._id === commentId) {
                    return {
                        ...comment,
                        replies: [...(comment.replies || []), ...replies], // ✅ Ensure new array reference
                    };
                }
    
                if (Array.isArray(comment.replies)) {
                    return {
                        ...comment,
                        replies: updateReplies(comment.replies), // ✅ Ensure nested replies update correctly
                    };
                }
    
                return comment;
            });
        };
    
        const updateReview = (reviews) => {
            const reviewIndex = reviews.findIndex((r) => r._id === reviewId);
            if (reviewIndex !== -1) {
                const review = reviews[reviewIndex];
    
                // ✅ Ensure React re-renders by creating a new object reference
                reviews[reviewIndex] = {
                    ...review,
                    comments: updateReplies(review.comments || []),
                };
            }
        };
    
        updateReview(state.userAndFriendsReviews);
        updateReview(state.otherUserReviews);
        updateReview(state.profileReviews);
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
