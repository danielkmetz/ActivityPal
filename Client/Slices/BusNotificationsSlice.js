import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const BASE_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/business-notifications`;

// Fetch all notifications for the business
export const fetchBusinessNotifications = createAsyncThunk(
  'businessNotifications/fetch',
  async (placeId) => {
    const response = await axios.get(`${BASE_URL}/${placeId}/notifications`);
    return response.data;
  }
);

// Mark a business notification as read
export const markBusinessNotificationRead = createAsyncThunk(
  'businessNotifications/markRead',
  async ({ placeId, notificationId }) => {
    await axios.put(`${BASE_URL}/${placeId}/notifications/${notificationId}/read`);
    return notificationId;
  }
);

// Create a new business notification
export const createBusinessNotification = createAsyncThunk(
  'businessNotifications/create',
  async (
    {
      placeId,
      postType,
      type,
      message,
      relatedId,
      typeRef,
      targetId = null,
      targetRef,
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await axios.post(`${BASE_URL}/${placeId}/notifications`, {
        postType,
        type,
        message,
        relatedId,
        typeRef,
        targetId,
        targetRef,
      });
      return response.data.notification;
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to create notification');
    }
  }
);

// Delete a business notification
export const deleteBusinessNotification = createAsyncThunk(
  'businessNotifications/delete',
  async ({ placeId, notificationId }, { rejectWithValue }) => {
    try {
      await axios.delete(`${BASE_URL}/${placeId}/notifications/${notificationId}`);
      return { placeId, notificationId };
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Delete failed');
    }
  }
);

const businessNotificationsSlice = createSlice({
  name: 'businessNotifications',
  initialState: {
    list: [],
    unreadCount: 0,
    status: 'idle',
  },
  reducers: {
    resetBusinessNotifications: (state) => {
      state.list = [];
    },
    resetBusinessUnreadCount: (state) => {
      state.unreadCount = 0;
    },
    setBusinessNotifications: (state, action) => {
      state.list = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBusinessNotifications.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchBusinessNotifications.fulfilled, (state, action) => {
        state.list = [...action.payload];
        state.unreadCount = action.payload.filter((n) => !n.read).length;
        state.status = 'succeeded';
      })
      .addCase(fetchBusinessNotifications.rejected, (state) => {
        state.status = 'failed';
      })
      .addCase(markBusinessNotificationRead.fulfilled, (state, action) => {
        state.list = state.list.map((n) =>
          n._id === action.payload ? { ...n, read: true } : n
        );
        state.unreadCount = Math.max(state.unreadCount - 1, 0);
      })
      .addCase(createBusinessNotification.fulfilled, (state) => {
        state.status = 'idle';
      })
      .addCase(deleteBusinessNotification.fulfilled, (state, action) => {
        const { notificationId } = action.payload;
        state.list = state.list.filter((n) => n._id !== notificationId);
      })
      .addCase(deleteBusinessNotification.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export default businessNotificationsSlice.reducer;

export const selectBusinessNotifications = (state) =>
  state.businessNotifications.list;
export const selectBusinessUnreadCount = (state) =>
  state.businessNotifications.unreadCount;
export const selectBusinessStatus = (state) =>
  state.businessNotifications.status;

export const {
  resetBusinessNotifications,
  resetBusinessUnreadCount,
  setBusinessNotifications,
} = businessNotificationsSlice.actions;
