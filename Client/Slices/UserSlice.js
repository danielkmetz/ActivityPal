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

      return { user, token };
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
  async ({ email, password, firstName, lastName, isBusiness, placeId, businessName, location, lat, lng }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, firstName, lastName, isBusiness, placeId, businessName, location, lat, lng }),
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

export const fetchPrivacySettings = createAsyncThunk(
  'privacy/fetchPrivacySettings',
  async (userId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.get(`${BASE_URL}/users/privacy-settings/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data.privacySettings;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch privacy settings');
    }
  }
);

export const fetchOtherUserSettings = createAsyncThunk(
  'privacy/fetchOtherUserPrivacySettings',
  async (userId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.get(`${BASE_URL}/users/privacy-settings/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data.privacySettings;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch privacy settings');
    }
  }
);

export const updatePrivacySettings = createAsyncThunk(
  'user/updatePrivacySettings',
  async ({ userId, profileVisibility }, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.put(
        `${BASE_URL}/users/privacy-settings/${userId}`,
        { profileVisibility },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.privacySettings;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update privacy settings');
    }
  }
);

export const fetchUserFullName = createAsyncThunk(
  'user/fetchUserFullName',
  async (userId, thunkAPI) => {
    try {
      const token = await getUserToken();

      const response = await axios.get(`${BASE_URL}/users/fullname/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`, // if using token auth
        },
      });
      return response.data.fullName;
    } catch (error) {
      console.error('Failed to fetch full name:', error);
      return thunkAPI.rejectWithValue(error.response?.data || { message: 'Unknown error' });
    }
  }
);

export const deleteUserAccount = createAsyncThunk(
  'user/deleteUserAccount',
  async (userId, { rejectWithValue, dispatch }) => {
    try {
      const token = await getUserToken();

      const response = await axios.delete(`${BASE_URL}/users/user/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Clear local auth token
      await AsyncStorage.removeItem('authToken');

      // Dispatch logout to clear local state
      dispatch(logout());

      return response.data.message;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete user account'
      );
    }
  }
);

export const updateAnyPrivacySettings = createAsyncThunk(
  'user/updateAnyPrivacySettings',
  async ({ userId, updates }, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.put(
        `${BASE_URL}/users/privacy-settings/${userId}`,
        updates, // example: { messagePermissions: 'peopleIFollow', tagPermissions: 'noTags' }
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.privacySettings;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update privacy settings');
    }
  }
);

export const fetchBusinessId = createAsyncThunk(
  'user/fetchBusinessIdByPlaceId',
  async (placeId, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.get(
        `${BASE_URL}/businessUsers/id/${placeId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data.businessId; // Mongo _id
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch business ID'
      );
    }
  }
);

// User slice
const userSlice = createSlice({
  name: "user",
  initialState: {
    user: null, // User data
    otherUserData: [],
    privacySettings: {
      profileVisibility: 'public',
      invites: 'friendsOnly',
      contentVisibility: 'public',
    },
    otherUserSettings: {
      profileVisibility: 'public',
      invites: 'friendsOnly',
      contentVisibility: 'public',
    },
    otherUserName: null,
    token: null, // JWT token (if applicable)
    isBusiness: false, // User type
    businessId: null,
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
      state.businessName = null;
    },
    resetBusinessName: (state) => {
      state.businessName = null;
    },
    resetBusinessId: (state) => {
      state.businessId = null;
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
      .addCase(fetchPrivacySettings.fulfilled, (state, action) => {
        state.privacySettings = action.payload;
      })
      .addCase(fetchOtherUserSettings.fulfilled, (state, action) => {
        state.otherUserSettings = action.payload;
      })
      .addCase(updatePrivacySettings.fulfilled, (state, action) => {
        state.privacySettings = action.payload;
      })
      .addCase(updatePrivacySettings.rejected, (state, action) => {
        state.error = action.payload || 'Failed to update privacy settings';
      })
      .addCase(fetchUserFullName.fulfilled, (state, action) => {
        state.otherUserName = action.payload;
      })
      .addCase(fetchUserFullName.rejected, (state, action) => {
        state.error = action.payload || 'Failed to fetch other user name';
      })
      .addCase(deleteUserAccount.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.isBusiness = false;
        state.loading = false;
        state.error = null;
      })
      .addCase(deleteUserAccount.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Account deletion failed';
      })
      .addCase(updateAnyPrivacySettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateAnyPrivacySettings.fulfilled, (state, action) => {
        state.loading = false;
        state.privacySettings = action.payload;
      })
      .addCase(updateAnyPrivacySettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to update privacy settings';
      })
      .addCase(fetchBusinessId.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBusinessId.fulfilled, (state, action) => {
        state.loading = false;
        state.businessId = action.payload;
      })
      .addCase(fetchBusinessId.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch business ID';
      })
  },
});

export const { logout, resetBusinessId } = userSlice.actions;

export const selectUser = (state) => state.user.user;
export const selectLoading = (state) => state.user.loading;
export const selectError = (state) => state.user.error;
export const selectIsBusiness = (state) => state.user.isBusiness;
export const selectOtherUserData = (state) => state.user.otherUserData || [];
export const selectOtherUserSettings = (state) => state.user.otherUserSettings;
export const selectPrivacySettings = (state) => state.user.privacySettings;
export const selectOtherUserName = state => state.user.otherUserName;
export const selectBusinessId = (state) => state.user.businessId;

export default userSlice.reducer;


