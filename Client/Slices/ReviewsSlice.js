import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { GET_USER_ACTIVITY_QUERY } from "./GraphqlQueries/Queries/getUserActivity";
import { GET_USER_POSTS_QUERY } from "./GraphqlQueries/Queries/getUserPosts";
import { GET_BUSINESS_REVIEWS_QUERY } from "./GraphqlQueries/Queries/getBusinessReviews";
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

export const toggleLike = createAsyncThunk(
  'posts/toggleLike',
  async ({ postType, placeId, postId, userId, fullName }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/reviews/${postType}/${placeId}/${postId}/like`,
        { userId, fullName }
      );

      return { postType, postId, likes: response.data.likes };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to toggle like');
    }
  }
);

export const addComment = createAsyncThunk(
  'comments/addComment',
  async ({ postType, placeId, postId, userId, fullName, commentText }, { rejectWithValue }) => {
    try {
      // Updated API request to include postType in the URL
      const response = await axios.post(
        `${BASE_URL}/reviews/${postType}/${placeId}/${postId}/comment`,
        { userId, commentText, fullName }
      );

      // ✅ Ensure we are correctly extracting the comment object
      if (!response.data.comment || !response.data.comment._id) {
        return rejectWithValue("Failed to add comment");
      }

      return {
        postType,  // ✅ Distinguish between reviews and check-ins in the Redux state
        postId,
        commentId: response.data.comment._id, // ✅ Correctly extracting the commentId
        comments: [response.data.comment], // ✅ Wrap in an array to prevent reducer errors
      };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to add comment');
    }
  }
);

// Add a reply to a specific comment
export const addReply = createAsyncThunk(
  'reviews/addReply',
  async ({ postType, placeId, postId, commentId, userId, fullName, commentText }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/reviews/${postType}/${placeId}/${postId}/${commentId}/reply`,
        { userId, fullName, commentText }
      );

      if (!response.data.reply || !response.data.reply._id) {
        return rejectWithValue("Failed to add reply");
      }

      return {
        postId,
        commentId,
        replyId: response.data.reply._id,
        replies: [response.data.reply],
        userId: response.data.parentCommentOwner,
      };
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Error adding reply');
    }
  }
)

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
        console.error('❌ GraphQL errors:', errors);
        return rejectWithValue(errors.map(err => err.message).join('; '));
      }

      const posts = data?.getUserPosts;

      if (!Array.isArray(posts)) {
        return [];
      }

      return posts;

    } catch (error) {
      console.error('❗ Apollo Client error:', {
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
  async ({ userId, limit = 15, after }, { rejectWithValue }) => {
    try {
      const { data, errors } = await client.query({
        query: GET_USER_ACTIVITY_QUERY,
        variables: { userId, limit, after },
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

export const deleteCommentOrReply = createAsyncThunk(
  "reviews/deleteCommentOrReply",
  async ({ postType, placeId, postId, commentId, relatedId }, { rejectWithValue }) => {
    try {
      const response = await axios.delete(`${BASE_URL}/reviews/${postType}/${placeId}/${postId}/${commentId}`, {
        data: { relatedId },
      });
      return { commentId, postId }; // Returning deleted comment/reply ID for UI update
    } catch (error) {
      console.error("Error deleting comment or reply:", error.response?.data || error.message);
      return rejectWithValue(error.response?.data?.message || "Failed to delete comment or reply");
    }
  }
);

export const fetchPostById = createAsyncThunk(
  'reviews/fetchReviewById',
  async ({ postType, postId }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/reviews/${postType}/${postId}`);
      return response.data; // Returns { placeId, businessName, review }
    } catch (error) {
      console.error("Error fetching review:", error);
      return rejectWithValue(error.response?.data || "Failed to fetch review");
    }
  }
);

export const editCommentOrReply = createAsyncThunk(
  "reviews/editCommentOrReply",
  async ({ postType, placeId, postId, commentId, userId, newText }, { rejectWithValue }) => {
    try {
      const response = await axios.put(
        `${BASE_URL}/reviews/${postType}/${placeId}/${postId}/${commentId}`,
        { userId, newText }
      );

      if (!response.data.updatedComment) {
        return rejectWithValue("Failed to update comment or reply");
      }

      return {
        postId,
        commentId,
        updatedComment: response.data.updatedComment,
      };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to update comment or reply");
    }
  }
);

export const toggleCommentLike = createAsyncThunk(
  "reviews/toggleCommentLike",
  async ({ postType, placeId, postId, commentId, userId, replyId = null }, { rejectWithValue }) => {
    try {
      const res = await axios.put(
        `${BASE_URL}/reviews/${postType}/${placeId}/${postId}/${commentId}/like`, {
        userId,
        replyId,
      });

      return {
        postType,
        placeId,
        postId,
        commentId,
        replyId,
        updatedLikes: res.data.updatedLikes,
      };
    } catch (error) {
      console.error("🚨 toggleCommentLike error:", error);
      return rejectWithValue(error.response?.data?.message || "Failed to toggle like");
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
    setLocalReviews: (state, action) => {
      state.localReviews = action.payload;
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
    addCheckInUserAndFriendsReviews: (state, action) => {
      const newCheckIn = action.payload;

      // ✅ Add new check-in to the top of the list
      state.userAndFriendsReviews = [
        newCheckIn,
        ...state.userAndFriendsReviews,
      ];
    },
    addCheckInProfileReviews: (state, action) => {
      const newCheckIn = action.payload;

      state.profileReviews = [
        newCheckIn,
        ...state.profileReviews,
      ]
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
      })
      .addCase(createReview.rejected, (state, action) => {
        state.loading = "idle";
        state.error = action.payload;
      })
      .addCase(toggleLike.fulfilled, (state, action) => {
        const { postId, likes } = action.payload;

        const updateLikes = (arr) =>
          arr.map((review) => (review._id === postId ? { ...review, likes: [...likes] } : review));

        state.profileReviews = updateLikes(state.profileReviews);
        state.userAndFriendsReviews = updateLikes(state.userAndFriendsReviews);
        state.otherUserReviews = updateLikes(state.otherUserReviews);
        state.businessReviews = updateLikes(state.businessReviews);
        state.suggestedPosts = updateLikes(state.suggestedPosts);
      })
      .addCase(addComment.fulfilled, (state, action) => {
        const { postId, comments } = action.payload;

        const updateComments = (review) => {
          if (review) {
            if (!Array.isArray(review.comments)) {
              review.comments = [];
            }
            review.comments.push(...comments);
          }
        };

        updateComments(state.otherUserReviews?.find((r) => r._id === postId));
        updateComments(state.userAndFriendsReviews?.find((r) => r._id === postId));
        updateComments(state.profileReviews?.find((r) => r._id === postId));
        updateComments(state.businessReviews?.find((r) => r._id === postId));
        updateComments(state.suggestedPosts?.find((r) => r._id === postId));
        updateComments(state.selectedReview?._id === postId ? state.selectedReview : null);
      })
      .addCase(addReply.pending, (state) => {
        state.loading = true;
      })
      .addCase(addReply.fulfilled, (state, action) => {
        const { postId, commentId, replies } = action.payload;

        const updateReplies = (comments) => {
          return comments.map((comment) => {
            if (comment._id === commentId) {
              return {
                ...comment,
                replies: [...(comment.replies || []), ...replies],
              };
            }
            if (Array.isArray(comment.replies)) {
              return {
                ...comment,
                replies: updateReplies(comment.replies),
              };
            }
            return comment;
          });
        };

        const updateReview = (reviews) => {
          const reviewIndex = reviews.findIndex((r) => r._id === postId);
          if (reviewIndex !== -1) {
            const review = reviews[reviewIndex];
            reviews[reviewIndex] = {
              ...review,
              comments: updateReplies(review.comments || []),
            };
          }
        };

        updateReview(state.userAndFriendsReviews);
        updateReview(state.otherUserReviews);
        updateReview(state.profileReviews);
        updateReview(state.businessReviews);
        updateReview(state.suggestedPosts);

        if (state.selectedReview?._id === postId) {
          state.selectedReview = {
            ...state.selectedReview,
            comments: updateReplies(state.selectedReview.comments || []),
          };
        }
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
      .addCase(deleteCommentOrReply.fulfilled, (state, action) => {
        const { postId, commentId } = action.payload;

        const removeCommentOrReply = (review) => {
          if (!review) return;

          const commentIndex = review.comments.findIndex((comment) => comment._id === commentId);
          if (commentIndex !== -1) {
            review.comments.splice(commentIndex, 1);
            return;
          }

          const removeNestedReply = (replies) => {
            if (!replies) return false;
            for (let i = 0; i < replies.length; i++) {
              if (replies[i]._id === commentId) {
                replies.splice(i, 1);
                return true;
              }
              if (removeNestedReply(replies[i].replies)) {
                return true;
              }
            }
            return false;
          };

          review.comments.forEach((comment) => {
            removeNestedReply(comment.replies);
          });
        };

        ["businessReviews", "profileReviews", "otherUserReviews", "userAndFriendsReviews", "suggestedPosts"].forEach((category) => {
          state[category].forEach((review) => {
            if (review._id === postId) {
              removeCommentOrReply(review);
            }
          });
        });

        if (state.selectedReview?._id === postId) {
          removeCommentOrReply(state.selectedReview);
        }
      })
      .addCase(editCommentOrReply.fulfilled, (state, action) => {
        const { postId, commentId, updatedComment } = action.payload;

        const updateCommentOrReply = (review) => {
          if (!review) return;

          // ✅ First, try updating a top-level comment
          const commentIndex = review.comments.findIndex((comment) => comment._id === commentId);
          if (commentIndex !== -1) {
            review.comments[commentIndex] = {
              ...review.comments[commentIndex],
              commentText: updatedComment.commentText,
            };
            return;
          }

          // ✅ Recursively search and update in `comment.replies`
          const updateNestedReply = (replies) => {
            if (!replies) return false;

            for (let i = 0; i < replies.length; i++) {
              if (replies[i]._id === commentId) {
                replies[i] = { ...replies[i], commentText: updatedComment.commentText }; // ✅ Update text
                return true;
              }

              // ✅ Search deeper in nested replies
              if (updateNestedReply(replies[i].replies)) {
                return true;
              }
            }
            return false;
          };

          // ✅ Check each comment's replies for the nested reply
          review.comments.forEach((comment) => {
            updateNestedReply(comment.replies);
          });
        };

        // ✅ Apply the update across all relevant review categories
        ["businessReviews", "suggestedPosts", "profileReviews", "otherUserReviews", "userAndFriendsReviews"].forEach((category) => {
          state[category].forEach((review) => {
            if (review._id === postId) {
              updateCommentOrReply(review);
            }
          });
        });
        // ✅ Update selectedReview if it's the one being edited
        if (state.selectedReview && state.selectedReview._id === postId) {
          updateCommentOrReply(state.selectedReview);
        }
      })
      .addCase(toggleCommentLike.fulfilled, (state, action) => {
        const { postId, commentId, replyId, updatedLikes } = action.payload;

        const updateLikesRecursive = (nodes, targetId) => {
          if (!Array.isArray(nodes)) return false;

          for (let node of nodes) {
            if (node._id === targetId) {
              node.likes = updatedLikes;
              return true;
            }
            if (updateLikesRecursive(node.replies, targetId)) {
              return true;
            }
          }
          return false;
        };

        const applyLikeUpdate = (review) => {
          if (!review || !Array.isArray(review.comments)) return;

          const targetId = replyId || commentId; // 👍 Handle both cases
          updateLikesRecursive(review.comments, targetId);
        };

        const categories = [
          "businessReviews",
          "profileReviews",
          "otherUserReviews",
          "userAndFriendsReviews",
          "suggestedPosts",
        ];

        categories.forEach((category) => {
          state[category]?.forEach((review) => {
            if (review._id === postId) {
              applyLikeUpdate(review);
            }
          });
        });

        if (state.selectedReview && state.selectedReview._id === postId) {
          applyLikeUpdate(state.selectedReview);
        }
      })
      .addCase(editCommentOrReply.rejected, (state, action) => {
        state.error = action.payload;
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
  setLocalReviews,
  resetOtherUserReviews,
  resetBusinessReviews,
  clearSelectedReview,
  resetAllReviews,
  setHasFetchedOnce,
  setSuggestedPosts,
  updatePostInReviewState,
} = reviewsSlice.actions;

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
