import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getUserToken } from '../functions';
import { GET_SUGGESTED_FOLLOWS_QUERY } from './GraphqlQueries/Queries/suggestedFollowQuery';
import client from '../apolloClient';

const BASE_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/connections`;

export const sendFollowRequest = createAsyncThunk(
  'follows/sendFollowRequest',
  async (targetUserId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const response = await axios.post(`${BASE_URL}/follow-request`, { targetUserId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to follow user.');
    }
  }
);

export const followUserImmediately = createAsyncThunk(
  'follows/followUserImmediately',
  async ({ targetUserId, isFollowBack = false }, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.post(
        `${BASE_URL}/follow/${targetUserId}`,
        { isFollowBack }, // ✅ send as body
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { ...response.data, isFollowBack };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to follow user.');
    }
  }
);

export const cancelFollowRequest = createAsyncThunk(
  'follows/cancelFollowRequest',
  async (recipientId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      await axios.post(`${BASE_URL}/cancel-follow-request`, { recipientId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { recipientId };
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to cancel follow request.');
    }
  }
);

export const approveFollowRequest = createAsyncThunk(
  'follows/approveFollowRequest',
  async (requesterId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const res = await axios.post(`${BASE_URL}/approve-follow-request`, { requesterId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data; // 👈 return enriched user object
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to approve follow request.');
    }
  }
);

export const declineFollowRequest = createAsyncThunk(
  'follows/declineFollowRequest',
  async (requesterId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      await axios.post(`${BASE_URL}/decline-follow-request`, { requesterId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { requesterId };
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to decline follow request.');
    }
  }
);

export const unfollowUser = createAsyncThunk(
  'follows/unfollowUser',
  async (targetUserId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      await axios.delete(`${BASE_URL}/unfollow/${targetUserId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { targetUserId };
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to unfollow user.');
    }
  }
);

export const fetchUserSuggestions = createAsyncThunk(
  'follows/fetchUserSuggestions',
  async (query, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      // Make the request with the Authorization header
      const response = await axios.get(`${BASE_URL}/search?query=${query}`, {
        headers: {
          Authorization: `Bearer ${token}`, // Include the token here
        },
      });

      return response.data; // Assuming API returns an array of users
    } catch (error) {
      // Pass only the string error message
      return rejectWithValue(error.response?.data?.message || 'An error occurred');
    }
  }
);

export const fetchSuggestedFriends = createAsyncThunk(
  'follows/fetchSuggestedFriends',
  async (userId, { rejectWithValue }) => {
    try {
      const { data, errors } = await client.query({
        query: GET_SUGGESTED_FOLLOWS_QUERY,
        variables: { userId },
        fetchPolicy: 'network-only', // Optional: ensures no stale cache
      });

      if (errors?.length) {
        console.error('❌ GraphQL errors:', errors);
        return rejectWithValue(errors.map(err => err.message).join('; ') || 'GraphQL query error');
      }

      if (!data?.getSuggestedFollows) {
        return rejectWithValue('No suggested users returned');
      }

      return data.getSuggestedFollows;
    } catch (error) {
      return rejectWithValue(
        error.graphQLErrors?.map(e => e.message).join('; ') ||
        error.networkError?.message ||
        error.message ||
        'Failed to fetch suggested users'
      );
    }
  }
);

export const fetchFollowersAndFollowing = createAsyncThunk(
  'follows/fetchFollowersAndFollowing',
  async (userId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.get(`${BASE_URL}/followers-following/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data; // contains { followers, following }
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch followers/following');
    }
  }
);

export const fetchOtherUserFollowersAndFollowing = createAsyncThunk(
  'follows/fetchOtherUserFollowersAndFollowing',
  async (userId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.get(`${BASE_URL}/followers-following/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data; // contains { followers, following }
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch followers/following');
    }
  }
);

export const fetchFollowRequests = createAsyncThunk(
  'follows/fetchFollowRequests',
  async (_, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const response = await axios.get(`${BASE_URL}/follow-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch follow requests');
    }
  }
);

export const fetchMutualFriends = createAsyncThunk(
  'follows/fetchMutualFriends',
  async (userId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const response = await axios.get(`${BASE_URL}/${userId}/friends`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data; // array of enriched users
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch mutual friends');
    }
  }
)

const initialState = {
  friends: [],
  followers: [],
  following: [],
  otherUserFollowers: [],
  otherUserFollowing: [],
  followRequests: {
    sent: [],
    received: [],
  },
  suggestedUsers: [],
  userSuggestions: [],
  hasFetchedSuggestions: false,
  followBack: false,
  status: 'idle',
  error: null,
};

const followsSlice = createSlice({
  name: 'follows',
  initialState,
  reducers: {
    setFollowers: (state, action) => {
      state.followers = action.payload;
    },
    setFollowing: (state, action) => {
      state.following = action.payload;
    },
    setFollowRequests: (state, action) => {
      state.followRequests = {
        sent: action.payload.sent || [],
        received: action.payload.received || [],
      };
    },
    setFollowBack: (state, action) => {
      state.followBack = action.payload;
    },
    resetOtherUserConnections: (state) => {
      state.otherUserFollowers = [];
      state.otherUserFollowing = [];
    },
    resetFriends: () => initialState,
    setHasFetchedSuggestions: (state, action) => {
      state.hasFetchedOnce = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendFollowRequest.fulfilled, (state, action) => {
        const { follower } = action.payload;

        if (follower && !state.followRequests.sent.find(u => u._id === follower._id)) {
          state.followRequests.sent.push(follower);
        }

        state.suggestedUsers = state.suggestedUsers.filter(u => u._id !== follower._id);
      })
      .addCase(cancelFollowRequest.fulfilled, (state, action) => {
        const { recipientId } = action.payload;
        state.followRequests.sent = state.followRequests.sent.filter(
          user => user._id !== recipientId
        );
      })
      .addCase(approveFollowRequest.fulfilled, (state, action) => {
        const { follower } = action.payload;
        const id = follower._id;

        // Add full user object to followers if not already there
        if (!state.followers.some(u => u._id === id)) {
          state.followers.push(follower);
        }
      })
      .addCase(declineFollowRequest.fulfilled, (state, action) => {
        const { requesterId } = action.payload;
        state.followRequests.received = state.followRequests.received.filter(
          user => user._id !== requesterId
        );
      })
      .addCase(unfollowUser.fulfilled, (state, action) => {
        const { targetUserId } = action.payload;

        state.following = state.following.filter(
          user => user._id !== targetUserId
        );
        state.friends = state.friends?.filter(
          user => user._id !== targetUserId
        );
      })
      // Reuse existing logic for userSuggestions & suggestedUsers
      .addCase(fetchUserSuggestions.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchUserSuggestions.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.userSuggestions = action.payload;
      })
      .addCase(fetchUserSuggestions.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(fetchSuggestedFriends.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.suggestedUsers = action.payload;
      })
      .addCase(followUserImmediately.fulfilled, (state, action) => {
        const { targetUser, isFollowBack } = action.payload;

        const alreadyFollowing = state.following.some(user => user._id === targetUser._id);
        if (!alreadyFollowing) {
          state.following.push(targetUser);
        }
        if (isFollowBack) {
          const alreadyFriends = state.friends?.some(user => user._id === targetUser._id);
          if (!alreadyFriends) {
            state.friends = [...(state.friends || []), targetUser];
            state.followRequests.received = state.followRequests.received.filter(
              u => (u._id || u) !== targetUser._id
            );
          }
        }
        state.suggestedUsers = state.suggestedUsers.filter(u => u._id !== targetUser._id);
      })
      .addCase(followUserImmediately.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(fetchFollowersAndFollowing.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchFollowersAndFollowing.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.followers = action.payload.followers || [];
        state.following = action.payload.following || [];
      })
      .addCase(fetchFollowersAndFollowing.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(fetchOtherUserFollowersAndFollowing.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchOtherUserFollowersAndFollowing.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.otherUserFollowers = action.payload.followers || [];
        state.otherUserFollowing = action.payload.following || [];
      })
      .addCase(fetchOtherUserFollowersAndFollowing.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(fetchFollowRequests.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.followRequests = {
          sent: action.payload.sent,
          received: action.payload.received,
        };
      })
      .addCase(fetchMutualFriends.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchMutualFriends.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.friends = action.payload; // enriched mutual users
      })
      .addCase(fetchMutualFriends.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
  },
});

export default followsSlice.reducer;

export const selectFollowing = state => state.follows.following || [];
export const selectFollowers = state => state.follows.followers || [];
export const selectOtherUserFollowers = (state) => state.follows.otherUserFollowers || [];
export const selectOtherUserFollowing = (state) => state.follows.otherUserFollowing || [];
export const selectFollowRequests = state => state.follows.followRequests || [];
export const selectSuggestedUsers = state => state.follows.suggestedUsers || [];
export const selectUserSuggestions = state => state.follows.userSuggestions || [];
export const selectFriends = (state) => state.follows.friends || [];
export const selectFollowBack = (state) => state.follows.followBack;
export const selectHasFetchedSuggestions = (state) => state.follows.hasFetchedSuggested;
export const selectStatus = (state) => state.follows.status;
export const selectError = (state) => state.follows.error;

export const { setFollowers, setHasFetchedSuggestions, resetOtherUserConnections, setFollowing, setFollowRequests, resetFriends, followBack, setFollowBack } = followsSlice.actions;
