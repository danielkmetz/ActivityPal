import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

// Replace with your actual base URL
const API_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/directMessages`;

// 🔄 Fetch all conversations for the user
export const fetchConversations = createAsyncThunk(
    'directMessages/fetchConversations',
    async (_, { rejectWithValue }) => {
        try {
            const res = await axios.get(`${API_URL}/conversations`);
            return res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data || 'Error fetching conversations');
        }
    }
);

// 💬 Fetch all messages in a conversation
export const fetchMessages = createAsyncThunk(
    'directMessages/fetchMessages',
    async (conversationId, { rejectWithValue }) => {
        try {
            const res = await axios.get(`${API_URL}/messages/${conversationId}`);
            return { conversationId, messages: res.data };
        } catch (err) {
            return rejectWithValue(err.response?.data || 'Error fetching messages');
        }
    }
);

// ✉️ Send a message
export const sendMessage = createAsyncThunk(
    'directMessages/sendMessage',
    async (payload, { rejectWithValue }) => {
        try {
            const res = await axios.post(`${API_URL}/message`, payload);
            return res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data || 'Error sending message');
        }
    }
);

// 🧠 Slice
const directMessagesSlice = createSlice({
    name: 'directMessages',
    initialState: {
        conversations: [],
        messagesByConversation: {}, // { [conversationId]: [messages] }
        userToMessage: null,
        searchModalOpen: false,
        loading: false,
        error: null,
    },
    reducers: {
        receiveMessage: (state, action) => {
            const message = action.payload;
            const convId = message.conversationId;

            if (!state.messagesByConversation[convId]) {
                state.messagesByConversation[convId] = [];
            }

            state.messagesByConversation[convId].push(message);
        },
        resetDirectMessages: (state) => {
            state.conversations = [];
            state.messagesByConversation = {};
        },
        chooseUserToMessage: (state, action) => {
            state.userToMessage = action.payload;
        },
        resetUserToMessage: (state) => {
            state.userToMessage = null;
        },
        openSearchModal: (state) => {
            state.searchModalOpen = true;
        },
        closeSearchModal: (state) => {
            state.searchModalOpen = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchConversations.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchConversations.fulfilled, (state, action) => {
                state.loading = false;
                state.conversations = action.payload;
            })
            .addCase(fetchConversations.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            .addCase(fetchMessages.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchMessages.fulfilled, (state, action) => {
                state.loading = false;
                const { conversationId, messages } = action.payload;
                state.messagesByConversation[conversationId] = messages;
            })
            .addCase(fetchMessages.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            .addCase(sendMessage.fulfilled, (state, action) => {
                const message = action.payload;
                const convId = message.conversationId;
                if (!state.messagesByConversation[convId]) {
                    state.messagesByConversation[convId] = [];
                }
                state.messagesByConversation[convId].push(message);
            });
    },
});

export const { 
    receiveMessage, 
    resetDirectMessages, 
    chooseUserToMessage, 
    resetUserToMessage,
    openSearchModal,
    closeSearchModal, 
} = directMessagesSlice.actions;

export const selectConversations = (state) => state.directMessages.conversations || [];
export const selectMessagesConversation = (state) => state.directMessages.messagesByConversation || {};
export const selectUserToMessage = (state) => state.directMessages.userToMessage;
export const selectFollowing = (state) => state.directMessages.userToMessage;
export const searchModalVisibility = (state) => state.directMessages.searchModalOpen;

export default directMessagesSlice.reducer;
