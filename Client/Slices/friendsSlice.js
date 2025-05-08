import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getUserToken } from '../functions';

const BASE_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/connections`;

export const sendFollowRequest = createAsyncThunk(
  'follows/sendFollowRequest',
  async (targetUserId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const response = await axios.post(`${BASE_URL}/follow-request`, { targetUserId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { targetUserId, isPrivate: response.data.message.includes('request') };
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to follow user.');
    }
  }
);

export const followUserImmediately = createAsyncThunk(
  'follows/followUserImmediately',
  async (targetUserId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const response = await axios.post(`${BASE_URL}/follow/${targetUserId}`, null, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return { targetUserId };
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
      await axios.post(`${BASE_URL}/approve-follow-request`, { requesterId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { requesterId };
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
      const token = await getUserToken();
      const response = await axios.get(`${BASE_URL}/suggested-friends/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data; // Array of suggested users with mutualCount
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch suggested friends');
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
);

const initialState = {
  friends: [],
  followers: [],
  following: [],
  followRequests: {
    sent: [],
    received: [],
  },
  suggestedUsers: [],
  userSuggestions: [],
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
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendFollowRequest.fulfilled, (state, action) => {
        const { targetUserId, isPrivate } = action.payload;
        if (isPrivate) {
          state.followRequests.sent.push(targetUserId);
        } else {
          state.following.push(targetUserId);
        }
      })
      .addCase(cancelFollowRequest.fulfilled, (state, action) => {
        state.followRequests.sent = state.followRequests.sent.filter(
          id => id !== action.payload.recipientId
        );
      })
      .addCase(approveFollowRequest.fulfilled, (state, action) => {
        const { requesterId } = action.payload;
        state.followers.push(requesterId);
        state.followRequests.received = state.followRequests.received.filter(id => id !== requesterId);
      })
      .addCase(declineFollowRequest.fulfilled, (state, action) => {
        const { requesterId } = action.payload;
        state.followRequests.received = state.followRequests.received.filter(id => id !== requesterId);
      })
      .addCase(unfollowUser.fulfilled, (state, action) => {
        const { targetUserId } = action.payload;
        state.following = state.following.filter(id => id !== targetUserId);
        state.followers = state.followers.filter(id => id !== targetUserId);
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
        const { targetUserId } = action.payload;
        if (!state.following.includes(targetUserId)) {
          state.following.push(targetUserId);
        }
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
export const selectFollowRequests = state => state.follows.followRequests || [];
export const selectSuggestedUsers = state => state.follows.suggestedUsers || [];
export const selectUserSuggestions = state => state.follows.userSuggestions || [];
export const selectFriends = (state) => state.follows.friends || []; 

export const selectStatus = (state) => state.follows.status;
export const selectError = (state) => state.follows.error;

export const { setFollowers, setFollowing, setFollowRequests } = followsSlice.actions;
