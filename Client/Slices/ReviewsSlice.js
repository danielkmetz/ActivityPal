import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const GRAPHQL_ENDPOINT = `${BASE_URL}/graphql`;

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

// Thunk to create a new review for a business
export const createReview = createAsyncThunk(
  "reviews/createReview",
  async ({ placeId, businessName, userId, rating, reviewText, date, fullName, photos, taggedUsers, location }, { rejectWithValue }) => {
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
          taggedUsers,
          location,
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
  'posts/toggleLike',
  async ({ postType, placeId, postId, userId, fullName }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/reviews/${postType}/${placeId}/${postId}/like`,
        { userId, fullName }
      );

      console.log(`Likes count for ${postType} ${postId}:`, response.data.likes.length);
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
      console.log("📤 Sending API request to add comment...", {
        postType,
        placeId,
        postId,
        userId,
        fullName,
        commentText
      });

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
  async (userId, { rejectWithValue }) => {
    console.log('user reviews being fetched')
    try {
      const query = `
        query GetUserPosts($userId: String!) {
          getUserPosts(userId: $userId) {
            __typename  

            ... on Review {
              _id
              type
              userId
              fullName
              date
              placeId
              businessName
              taggedUsers {
                _id
                fullName
              }
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
                taggedUsers {
                  _id
                  fullName
                  x
                  y
                }
                uploadDate
                url
              }
              rating
              reviewText
            }

            ... on CheckIn {
              _id
              type
              userId
              fullName
              date
              placeId
              businessName
              message
              taggedUsers {
                _id
                fullName
              }
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
                taggedUsers {
                  _id
                  fullName
                  x
                  y
                }
                uploadDate
                url
              }
            }
          }
        }
      `;

      const response = await axios.post(GRAPHQL_ENDPOINT, {
        query,
        variables: { userId },
      });
      console.log(response.data)

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }
      
      return response.data.data.getUserPosts || [];
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          `GraphQL Request Failed - Status: ${error.response.status}, Message: ${error.response.data?.message || "Unknown Error"}`
        );
      } else if (error.request) {
        return rejectWithValue("No response from GraphQL server. Please check your network connection.");
      } else {
        return rejectWithValue(error.message || "Failed to fetch posts via GraphQL");
      }
    }
  }
);

export const fetchPostsByOtherUserId = createAsyncThunk(
  'reviews/fetchReviewsByOtherUserId',
  async (userId, { rejectWithValue }) => {
    try {
      const query = `
        query GetUserPosts($userId: String!) {
          getUserPosts(userId: $userId) {
            __typename  

            ... on Review {
              _id
              type
              userId
              fullName
              date
              placeId
              businessName
              taggedUsers {
                _id
                fullName
              }
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
                taggedUsers {
                  _id
                  fullName
                  x
                  y
                }
                uploadDate
                url
              }
              rating
              reviewText
            }

            ... on CheckIn {
              _id
              type
              userId
              fullName
              date
              placeId
              businessName
              message
              taggedUsers {
                _id
                fullName
              }
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
                taggedUsers {
                  _id
                  fullName
                  x
                  y
                }
                uploadDate
                url
              }
            }
          }
        }
      `;

      const response = await axios.post(GRAPHQL_ENDPOINT, {
        query,
        variables: { userId },
      });

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      return response.data.data.getUserPosts || [];
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          `GraphQL Request Failed - Status: ${error.response.status}, Message: ${error.response.data?.message || "Unknown Error"}`
        );
      } else if (error.request) {
        return rejectWithValue("No response from GraphQL server. Please check your network connection.");
      } else {
        return rejectWithValue(error.message || "Failed to fetch posts via GraphQL");
      }
    }
  }
);

export const fetchReviewsByUserAndFriends = createAsyncThunk(
  "reviews/fetchUserActivity",
  async (userId, { rejectWithValue }) => {
    try {
      const query = `
        query GetUserActivity($userId: String!) {
        getUserActivity(userId: $userId) {
          ... on Review {
            _id
            userId
            fullName
            businessName
            placeId
            rating
            reviewText
            date
            taggedUsers {
              _id
              fullName
            }
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
              taggedUsers {
                _id
                fullName
                x
                y
              }
              uploadDate
              url
            }
            type
          }

          ... on ActivityInvite {
            _id
            sender {
              id
              firstName
              lastName
              profilePicUrl
            }
            recipients {
              user {
                id
                firstName
                lastName
                profilePicUrl
              }
              status
            }
            placeId
            businessName
            businessLogoUrl
            note
            dateTime
            message
            isPublic
            status
            createdAt
            type

            requests {
              _id
              userId
              status
              firstName
              lastName
              profilePicUrl
            }

            # NEW: Likes
            likes {
              userId
              fullName
            }

            # NEW: Comments and Replies
            comments {
              _id
              userId
              fullName
              commentText
              date
              replies {
                _id
                userId
                fullName
                commentText
                date
                # Optionally support deeper replies here if needed
              }
            }
          }

          ... on CheckIn {
            _id
            userId
            fullName
            placeId
            businessName
            date
            message
            taggedUsers {
              _id
              fullName
            }
            profilePicUrl
            photos {
              _id
              photoKey
              uploadedBy
              description
              taggedUsers {
                _id
                fullName
                x
                y
              }
              uploadDate
              url
            }
            type
          }
        }
      }
    `;

      const response = await axios.post(GRAPHQL_ENDPOINT, {
        query,
        variables: { userId },
      });

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      if (!response.data.data || !response.data.data.getUserActivity) {
        throw new Error("GraphQL response did not return expected data.");
      }

      return response.data.data.getUserActivity;
    } catch (error) {
      console.error("❌ Error in fetchUserActivity thunk:", error);

      // Check if the error has a response (server-side error)
      if (error.response) {
        console.error("❌ Axios Error Response:", JSON.stringify(error.response.data, null, 2));
        console.error(`❌ Status Code: ${error.response.status}`);
        console.error(`❌ Status Text: ${error.response.statusText}`);

        if (error.response.data.errors) {
          console.error("❌ GraphQL Error Messages:", error.response.data.errors.map(err => err.message).join("; "));
        }

        return rejectWithValue(
          error.response.data.errors
            ? error.response.data.errors.map(err => err.message).join("; ")
            : `Request failed with status code ${error.response.status}`
        );
      }

      // Handle network errors or other unexpected errors
      console.error("❌ Network or Unknown Error:", error.message);
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

export const fetchReviewsByPlaceId = createAsyncThunk(
  'reviews/fetchReviewsByPlaceId',
  async (placeId, { rejectWithValue }) => {
    try {
      const query = `
        query GetBusinessReviews($placeId: String!) {
          getBusinessReviews(placeId: $placeId) {
            _id
            type
            businessName
            placeId
            userId
            fullName
            rating
            reviewText
            date
            taggedUsers {
              _id
              fullName
            }  
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
            profilePicUrl
            photos {
              _id
              photoKey
              uploadedBy
              description
              taggedUsers {
                _id
                fullName
              }
              uploadDate
              url # ✅ Pre-signed URL for review photos
            }
          }
        }
      `;

      // Make GraphQL request
      const response = await axios.post(GRAPHQL_ENDPOINT, {
        query,
        variables: { placeId },
      });

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      return response.data.data.getBusinessReviews;

    } catch (error) {
      return rejectWithValue(error.message || "Failed to fetch reviews via GraphQL");
    }
  }
);

export const editReview = createAsyncThunk(
  'reviews/editReview',
  async ({ placeId, reviewId, rating, reviewText, taggedUsers, photos }, thunkAPI) => {
    try {
      const response = await axios.put(`${BASE_URL}/reviews/${placeId}/${reviewId}`, {
        rating,
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
    setProfileReviews: (state, action) => {
      state.profileReviews = [...action.payload];
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
      .addCase(fetchPostsByOtherUserId.pending, (state) => {
        state.loading = "pending";
        state.error = null;
      })
      .addCase(fetchPostsByOtherUserId.fulfilled, (state, action) => {
        state.loading = "idle";
        state.otherUserReviews = action.payload;
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
        const { postId, likes, } = action.payload; // Ensure correct payload structure

        // ✅ Update `profileReviews` state
        state.profileReviews = state.profileReviews.map((review) =>
          review._id === postId ? { ...review, likes: [...likes] } : review
        );

        // ✅ Update `userAndFriendsReviews` state
        state.userAndFriendsReviews = state.userAndFriendsReviews.map((review) =>
          review._id === postId ? { ...review, likes: [...likes] } : review
        );

        // ✅ Update `otherUserReviews` state
        state.otherUserReviews = state.otherUserReviews.map((review) =>
          review._id === postId ? { ...review, likes: [...likes] } : review
        );

        state.businessReviews = state.businessReviews.map((review) =>
          review._id === postId ? { ...review, likes: [...likes] } : review
        );
      })
      .addCase(addComment.fulfilled, (state, action) => {
        const { postId, comments } = action.payload;

        const updateComments = (review) => {
          if (review) {
            if (!Array.isArray(review.comments)) {
              review.comments = []; // ✅ Ensure it's an array
            }
            review.comments.push(...comments); // ✅ Append safely
          }
        };

        updateComments(state.otherUserReviews?.find((r) => r._id === postId));
        updateComments(state.userAndFriendsReviews?.find((r) => r._id === postId));
        updateComments(state.profileReviews?.find((r) => r._id === postId));
        updateComments(state.businessReviews?.find((r) => r._id === postId));
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
          const reviewIndex = reviews.findIndex((r) => r._id === postId);
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
        updateReview(state.businessReviews);
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

          // ✅ First, try removing as a top-level comment
          const commentIndex = review.comments.findIndex((comment) => comment._id === commentId);
          if (commentIndex !== -1) {
            review.comments.splice(commentIndex, 1);
            return;
          }

          // ✅ Recursively search and delete in `comment.replies`
          const removeNestedReply = (replies) => {
            if (!replies) return false;

            for (let i = 0; i < replies.length; i++) {
              if (replies[i]._id === commentId) {
                replies.splice(i, 1);
                return true;
              }

              // ✅ Search deeper in nested replies
              if (removeNestedReply(replies[i].replies)) {
                return true;
              }
            }
            return false;
          };

          // ✅ Check each comment's replies for the nested reply
          review.comments.forEach((comment) => {
            removeNestedReply(comment.replies);
          });
        };

        // ✅ Apply the update across all relevant review categories
        ["businessReviews", "profileReviews", "otherUserReviews", "userAndFriendsReviews"].forEach((category) => {
          state[category].forEach((review) => {
            if (review._id === postId) {
              removeCommentOrReply(review);
            }
          });
        });
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
        ["businessReviews", "profileReviews", "otherUserReviews", "userAndFriendsReviews"].forEach((category) => {
          state[category].forEach((review) => {
            if (review._id === postId) {
              updateCommentOrReply(review);
            }
          });
        });
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
      })
      .addCase(editReview.rejected, (state, action) => {
        state.loading = "failed";
        state.error = action.payload || "Error editing review";
      })
  },
});

export default reviewsSlice.reducer;

export const { setUserAndFriendsReviews, setSelectedReview, setProfileReviews, addCheckInUserAndFriendsReviews, addCheckInProfileReviews, resetProfileReviews, setLocalReviews, resetOtherUserReviews, resetBusinessReviews, clearSelectedReview } = reviewsSlice.actions;

export const selectProfileReviews = (state) => state.reviews.profileReviews;
export const selectBusinessReviews = (state) => state.reviews.businessReviews;
export const selectOtherUserReviews = (state) => state.reviews.otherUserReviews;
export const selectLoading = (state) => state.reviews.loading;
export const selectError = (state) => state.reviews.error;
export const selectLocalReviews = (state) => state.reviews.localReviews;
export const selectUserAndFriendsReviews = (state) => state.reviews.userAndFriendsReviews;
export const selectSelectedReview = (state) => state.reviews.selectedReview;
