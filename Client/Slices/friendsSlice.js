import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getUserToken } from '../functions';
import { fetchUsersByIds } from './UserSlice';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

// Send a friend request
export const sendFriendRequest = createAsyncThunk(
    'friends/sendFriendRequest',
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

// Cancel a friend request
export const cancelFriendRequest = createAsyncThunk(
    'friendship/cancelFriendRequest',
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
        return rejectWithValue(error.response?.data || 'An error occurred')
      }
    }
);
  
// Accept a friend request
export const acceptFriendRequest = createAsyncThunk(
    'friends/acceptFriendRequest',
    async (senderId, { rejectWithValue }) => {
        const token = await getUserToken();
        try {
            const response = await axios.post(`${BASE_URL}/friends/accept-friend-request`,
                { senderId },
                {
                    headers: {
                        Authorization: `Bearer ${token}`, // Include the token here
                    },
                }
            
            );
            return response.data; // Assuming API returns a success message
        } catch (error) {
            return rejectWithValue(error.response.data);
        }
    }
);
  
// Decline a friend request
export const declineFriendRequest = createAsyncThunk(
    'friends/declineFriendRequest',
    async (senderId, { rejectWithValue }) => {
      try {
        const token = await getUserToken();

        const response = await axios.post(`${BASE_URL}/friends/decline-friend-request`, 
          { senderId },
          {
            headers: {
                Authorization: `Bearer ${token}`, // Include the token here
            },
          }
        );
        return response.data; // Assuming API returns a success message
      } catch (error) {
        return rejectWithValue(error.response.data);
      }
    }
);
  
// Remove a friend
export const removeFriend = createAsyncThunk(
    'friends/removeFriend',
    async (friendId, { rejectWithValue }) => {
      try {
        const token = await getUserToken();

        const response = await axios.delete(`${BASE_URL}/friends/remove-friend/${friendId}`, {
          headers: {
            Authorization: `Bearer ${token}`, // Include the token here
          },
        });
        return { friendId }; // Returning the friendId so we can update the state
      } catch (error) {
        return rejectWithValue(error.response.data);
      }
    }
);

export const fetchUserSuggestions = createAsyncThunk(
    'friends/fetchUserSuggestions',
    async (query, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            
            // Make the request with the Authorization header
            const response = await axios.get(`${BASE_URL}/friends/search?query=${query}`, {
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

const initialState = {
  friends: [], // List of friends
  friendRequests: {
    sent: [], // Requests sent by the user
    received: [], // Requests received by the user
  },
  userSuggestions: [],
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
};

const friendsSlice = createSlice({
    name: 'friends',
    initialState,
    reducers: {
        setFriends: (state, action) => {
            state.friends = action.payload;
        },
        setFriendRequests: (state, action) => {
            state.friendRequests = action.payload;
        },
    },
    extraReducers: (builder) => {
      builder
        .addCase(sendFriendRequest.fulfilled, (state, action) => {
          console.log("Action payload:", action.payload); // Debugging log
          if (action.payload?.recipientId) {
            state.friendRequests.sent = [...state.friendRequests.sent, action.payload.recipientId];
          }

          console.log("Updated friendRequests.sent:", state.friendRequests.sent)
        })
        .addCase(acceptFriendRequest.fulfilled, (state, action) => {
          // Add to friends and remove from received requests
          const senderId = action.meta.arg;
          state.friends.push(senderId);
          state.friendRequests.received = state.friendRequests.received.filter(
            (id) => id !== senderId
          );
        })
        .addCase(declineFriendRequest.fulfilled, (state, action) => {
          const senderId = action.meta.arg;
          state.friendRequests.received = state.friendRequests.received.filter(
            (id) => id !== senderId
          );
        })
        .addCase(removeFriend.fulfilled, (state, action) => {
          const { friendId } = action.payload;
          state.friends = state.friends.filter((id) => id !== friendId);
        })
        .addCase(fetchUserSuggestions.pending, (state) => {
            state.status = 'loading';
        })
        .addCase(fetchUserSuggestions.fulfilled, (state, action) => {
            state.status = 'succeeded';
            state.userSuggestions = action.payload; // Populate suggestions with API results
        })
        .addCase(fetchUserSuggestions.rejected, (state, action) => {
            state.status = 'failed';
            state.error = action.payload;
        })
        .addCase(cancelFriendRequest.fulfilled, (state, action) => {
            const recipientId = action.payload.recipientId.toString();
        
            // Ensure all IDs are strings for comparison
            state.friendRequests.sent = state.friendRequests.sent.filter(
                (id) => id.toString() !== recipientId.toString()
            );
        })
    },
});
  
export default friendsSlice.reducer;

export const selectFriends = (state) => state.friends.friends;
export const selectFriendRequests = (state) => state.friends.friendRequests;
export const selectUserSuggestions = (state) => state.friends.userSuggestions;
export const selectFriendsStatus = (state) => state.friends.status;
export const selectFriendsError = (state) => state.friends.error;

export const { setFriends, setFriendRequests } = friendsSlice.actions;

// Updated `setFriends` Reducer to Fetch User Info
export const setFriendsWithDetails = (friendIds) => async (dispatch) => {
  try {
    const response = await dispatch(fetchUsersByIds(friendIds));
    if (response.payload) {
      dispatch(setFriends(response.payload)); // Populate friends with user details
    }
  } catch (error) {
    console.error("Failed to fetch friends details:", error);
  }
};


  