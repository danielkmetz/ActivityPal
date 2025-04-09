import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL

// Fetch all notifications for the user
export const fetchNotifications = createAsyncThunk('notifications/fetch', async (userId) => {
    const response = await axios.get(`${BASE_URL}/notifications/${userId}/notifications`);
    return response.data;
});

// Mark a notification as read
export const markNotificationRead = createAsyncThunk('notifications/markRead', async ({ userId, notificationId }) => {
    await axios.put(`${BASE_URL}/notifications/${userId}/notifications/${notificationId}/read`);
    return notificationId;
});

// Create a new notification for a user
export const createNotification = createAsyncThunk(
    'notifications/createNotification',
    async ({ 
        userId, 
        type, 
        message, 
        relatedId, 
        typeRef, 
        commentText = null, 
        targetId = null, 
        commentId = null, 
        replyId = null,
        targetRef,
        postType,  
    }, { rejectWithValue }) => {
        try {
            const response = await axios.post(`${BASE_URL}/notifications/${userId}/notifications`, {
                type,
                message,
                relatedId,
                typeRef,
                targetId,
                commentId,
                replyId,
                commentText,
                postType,
                targetRef,
            });
            return response.data.notification;
        } catch (error) {
            return rejectWithValue(error.response?.data || 'Failed to create notification');
        }
    }
);

export const deleteNotification = createAsyncThunk(
    'notifications/deleteNotification',
    async ({ userId, notificationId }, { rejectWithValue }) => {
        try {
            const res = await axios.delete(`${BASE_URL}/notifications/${userId}/notifications/${notificationId}`);
            return { userId, notificationId };
        } catch (err) {
            return rejectWithValue(err.response?.data || 'Delete failed');
        }
    }
);

const notificationsSlice = createSlice({
    name: 'notifications',
    initialState: {
        list: [],
        unreadCount: 0,
        status: 'idle', // 'loading' | 'succeeded' | 'failed'
    },
    reducers: {
        resetNotifications: (state) => {
            state.list = [];
        },
        resetUnreadCount: (state) => {
            state.unreadCount = 0;
        },
        setNotifications: (state, action) => {
            state.list = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchNotifications.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchNotifications.fulfilled, (state, action) => {
                state.list = [...action.payload]; // ✅ Ensure a new array
                state.unreadCount = action.payload.filter(n => !n.read).length;
            })
            .addCase(fetchNotifications.rejected, (state) => {
                state.status = 'failed';
            })
            .addCase(markNotificationRead.fulfilled, (state, action) => {
                return {
                    ...state,  // ✅ Create a new state object
                    list: state.list.map(n =>
                        n._id === action.payload ? { ...n, read: true } : n
                    ),
                    unreadCount: Math.max(state.unreadCount - 1, 0),
                };
            })
            .addCase(createNotification.fulfilled, (state) => {
                state.status = 'idle'
            })
            .addCase(deleteNotification.fulfilled, (state, action) => {
                const { notificationId } = action.payload;
                state.list = state.list.filter(n => n._id !== notificationId); // ✅ correct key
            })            
            .addCase(deleteNotification.rejected, (state, action) => {
                state.error = action.payload;
            })
    },
});

export default notificationsSlice.reducer;

export const selectNotifications = (state) => state.notifications.list;
export const selectUnreadCount = (state) => state.notifications.unreadCount;
export const selectStatus = (state) => state.notifications.status;

export const {resetNotifications, resetUnreadCount, setNotifications} = notificationsSlice.actions;
