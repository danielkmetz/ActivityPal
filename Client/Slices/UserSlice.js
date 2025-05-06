import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserToken } from "../functions";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

// AsyncThunk for user login
export const loginUser = createAsyncThunk(
    "user/loginUser",
    async ({ email, password, isBusiness }, { rejectWithValue, dispatch }) => {
      try {
        const response = await axios.post(`${BASE_URL}/auth/login`, {
          email,
          password,
          isBusiness,
        });
        const { token, user } = response.data;

        await AsyncStorage.setItem('authToken', token);

        return {user, token};
      } catch (error) {
        // Capture and return error messages
        const errorMessage =
          error.response?.data?.message || error.message || "Login failed";
        return rejectWithValue(errorMessage);
      }
    }
);

export const registerUser = createAsyncThunk(
  "user/registerUser",
  async ({ email, password, firstName, lastName, isBusiness, placeId, businessName, location }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, firstName, lastName, isBusiness, placeId, businessName, location }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }

      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const loadToken = createAsyncThunk(
  "user/loadToken",
  async (_, { rejectWithValue }) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        // No token found, skip validation
        return null;
      }

      // Validate the token with the backend
      const response = await axios.get(`${BASE_URL}/auth/validate`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      return { user: response.data.user, token };
    } catch (error) {
      // Token is invalid or expired, clear it from storage
      await AsyncStorage.removeItem('authToken');
      return rejectWithValue(error.response?.data?.message || 'Token validation failed');
    }
  }
);

// AsyncThunk to update business info
export const updateBusinessInfo = createAsyncThunk(
  "user/updateBusinessInfo",
  async (businessInfo, { rejectWithValue, getState }) => {
    try {
      // Get the token from the Redux state
      const state = getState();
      const token = state.user.token;

      // Make the request to the backend
      const response = await axios.patch(
        `${BASE_URL}/businessUsers/update`,
        businessInfo,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error) {
      // Return error message if request fails
      return rejectWithValue(
        error.response?.data?.message || "Failed to update business info"
      );
    }
  }
);

// AsyncThunk for accepting friend request
export const acceptFriendRequest = createAsyncThunk(
  "user/acceptFriendRequest",
  async (senderId, { rejectWithValue, getState }) => {
    try {
      const token = await getUserToken();

      const response = await axios.post(
        `${BASE_URL}/friends/accept-friend-request`,
        { senderId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return { senderId, friend: response.data.friend };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to accept friend request"
      );
    }
  }
);

// Send a friend request
export const sendFriendRequest = createAsyncThunk(
  'user/sendFriendRequest',
  async (recipientId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.post(`${BASE_URL}/friends/send-friend-request`, 
          { recipientId },
          {
              headers: {
                  Authorization: `Bearer ${token}`, // Include the token here
              },
          }
      );
      return { recipientId }; // Assuming API returns a success message
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// AsyncThunk for declining friend request
export const declineFriendRequest = createAsyncThunk(
  "user/declineFriendRequest",
  async (senderId, { rejectWithValue, getState }) => {
    try {
      const token = await getUserToken();

      await axios.post(
        `${BASE_URL}/friends/decline-friend-request`,
        { senderId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return senderId;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to decline friend request"
      );
    }
  }
);

// AsyncThunk for removing a friend
export const removeFriend = createAsyncThunk(
  "user/removeFriend",
  async (friendId, { rejectWithValue, getState }) => {
    try {
      const token = await getUserToken();

      await axios.delete(`${BASE_URL}/friends/remove-friend/${friendId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return friendId;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to remove friend"
      );
    }
  }
);

// Cancel a friend request
export const cancelFriendRequest = createAsyncThunk(
  'user/cancelFriendRequest',
  async (recipientId, { rejectWithValue }) => {
    try {
      const token = await getUserToken(); // Fetch the token
      const response = await axios.post(
        `${BASE_URL}/friends/cancel-friend-request`,
        { recipientId },
        {
          headers: {
            Authorization: `Bearer ${token}`, // Add the token to the request
          },
        }
      );
      return { recipientId }; // Return recipientId to update state
    } catch (error) {
      return rejectWithValue(error.response?.data || 'An error occurred');
    }
  }
);

// Fetch an array of users' info
export const fetchFriendsDetails = createAsyncThunk(
  "user/fetchFriendsDetails",
  async (friendIds, { rejectWithValue }) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      const response = await axios.post(
        `${BASE_URL}/users/users/by-ids`,
        { userIds: friendIds },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data; // List of friend details
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch friend details"
      );
    }
  }
);

export const fetchFriendRequestsDetails = createAsyncThunk(
  "user/fetchFriendRequestsDetails",
  async (friendRequestIds, { rejectWithValue }) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      const response = await axios.post(
        `${BASE_URL}/users/users/by-ids`,
        { userIds: friendRequestIds },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data; // List of users who sent friend requests
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch friend request details"
      );
    }
  }
);

// User slice
const userSlice = createSlice({
  name: "user",
  initialState: {
    user: null, // User data
    friends: [], // List of friends
    friendsDetails: [],
    friendRequests: {
      sent: [],
      received: [],
    },
    friendRequestDetails: [],
    otherUserData: [],
    token: null, // JWT token (if applicable)
    isBusiness: false, // User type
    loading: false, // Loading state
    error: null, // Error message
  },
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isBusiness = false;
      state.loading = false;
      state.error = null;
      state.otherUserData = [];
      state.friends = [];
      state.friendRequests = {
        sent: [],
        received: [],
      };
      state.friendsDetails = [];
      state.businessName = null;
    },
    setFriends: (state, action) => {
      state.friends = action.payload;
    },
    setFriendsDetails: (state, action) => {
      state.friendsDetails = action.payload;
    },
    setFriendRequests: (state, action) => {
      state.friendRequests = action.payload;
    },
    resetBusinessName: (state) => {
      state.businessName = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isBusiness = action.payload.user.isBusiness;
        state.friends = action.payload.user.friends;
        state.friendRequests = action.payload.user.friendRequests;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "An error occurred";
      })
      .addCase(loadToken.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadToken.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isBusiness = action.payload.user.isBusiness;
        state.friends = action.payload.user.friends;
        state.friendRequests = action.payload.user.friendRequests;

      })
      .addCase(loadToken.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to load token';
      })
      .addCase(updateBusinessInfo.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateBusinessInfo.fulfilled, (state, action) => {
        state.loading = false;

        // Merge the updated business info with the user data
        if (state.user && state.user.businessDetails) {
          state.user.businessDetails = {
            ...state.user.businessDetails,
            ...action.payload.updatedUser,
          };
        }
      })
      .addCase(updateBusinessInfo.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "An error occurred while updating info";
      })
      .addCase(acceptFriendRequest.fulfilled, (state, action) => {
        const newFriend = action.payload.friend;
      
        // Add new friend ID to friends array
        if (!state.friends.includes(newFriend._id)) {
          state.friends.push(newFriend._id);
        }
      
        // Store full friend details separately
        state.friendsDetails.push(newFriend);
      
        // Remove from received friend requests
        state.friendRequests.received = state.friendRequests.received.filter(
          id => id !== newFriend._id
        );

        state.friendRequestDetails = state.friendRequestDetails.filter(
          user => user._id !== newFriend._id
        );
      })
      .addCase(declineFriendRequest.fulfilled, (state, action) => {
        const senderId = action.payload;

        state.friendRequests.received = state.friendRequests.received.filter(
          (id) => id !== senderId
        );

        state.friendRequestDetails = state.friendRequestDetails.filter(
          user => user._id !== senderId
        );
      })
      .addCase(removeFriend.fulfilled, (state, action) => {
        state.friends = state.friends.filter((id) => id !== action.payload);
      })
      .addCase(cancelFriendRequest.fulfilled, (state, action) => {
        const { recipientId } = action.payload;
              
        // Ensure all IDs are strings for comparison
        state.friendRequests.sent = state.friendRequests.sent.filter(
            (id) => id.toString() !== recipientId.toString()
        );
      })
      .addCase(fetchFriendsDetails.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchFriendsDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.friendsDetails = action.payload; // Store full details of friends
      })
      .addCase(fetchFriendsDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      .addCase(fetchFriendRequestsDetails.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchFriendRequestsDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.friendRequestDetails = action.payload; // Store full details of friend requests
      })
      .addCase(fetchFriendRequestsDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(sendFriendRequest.fulfilled, (state, action) => {
        if (action.payload?.recipientId) {
          state.friendRequests.sent = [...state.friendRequests.sent, action.payload.recipientId];
        }
      })
  },
});

export const { logout, setFriendsDetails, setFriends, } = userSlice.actions;

export const selectUser = (state) => state.user.user;
export const selectLoading = (state) => state.user.loading;
export const selectError = (state) => state.user.error;
export const selectIsBusiness = (state) => state.user.isBusiness;
export const selectOtherUserData = (state) => state.user.otherUserData || [];
export const selectFriends = (state) => state.user.friends || [];
export const selectFriendRequests = (state) => state.user.friendRequests;
export const selectFriendsDetails = (state) => state.user.friendsDetails || [];
export const selectFriendRequestDetails = (state) => state.user.friendRequestDetails || [];

export default userSlice.reducer;


