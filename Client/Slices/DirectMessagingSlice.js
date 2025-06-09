import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getUserToken } from '../functions';
import axios from 'axios';

// Replace with your actual base URL
const API_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/directMessages`;

// 🔄 Fetch all conversations for the user
export const fetchConversations = createAsyncThunk(
    'directMessages/fetchConversations',
    async (_, { rejectWithValue }) => {
        try {
            const token = await getUserToken();

            const res = await axios.get(`${API_URL}/conversations`, {
                headers: { Authorization: `Bearer ${token}` },
            });
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
            const token = await getUserToken();

            const res = await axios.get(`${API_URL}/messages/${conversationId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return { conversationId, messages: res.data };
        } catch (err) {
            return rejectWithValue(err.response?.data || 'Error fetching messages');
        }
    }
);

export const sendMessage = createAsyncThunk(
    'directMessages/sendMessage',
    async (payload, { rejectWithValue }) => {
        try {
            const token = await getUserToken();

            const res = await axios.post(`${API_URL}/message`, payload, {
                headers: { Authorization: `Bearer ${token}` },
            });

            return {
                message: res.data.message,
                conversationId: res.data.conversationId,
                conversation: res.data.conversation || null,
            };
        } catch (err) {
            return rejectWithValue(err.response?.data || 'Error sending message');
        }
    }
);

// ⚡ Create or get a conversation between two users
export const getOrCreateConversation = createAsyncThunk(
    'directMessages/getOrCreateConversation',
    async (recipientId, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            const res = await axios.post(`${API_URL}/conversation`, { recipientId }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return {
                conversation: res.data.conversation,
                messages: res.data.messages,
            };
        } catch (err) {
            return rejectWithValue(err.response?.data || 'Error fetching/creating conversation');
        }
    }
);

// 🧠 Slice
const directMessagesSlice = createSlice({
    name: 'directMessages',
    initialState: {
        conversations: [],
        messagesByConversation: {}, // { [conversationId]: [messages] }
        currentConversation: null,
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
        setCurrentConversation: (state, action) => {
            state.currentConversation = action.payload;
        },
        resetCurrentConversation: (state) => {
            state.currentConversation = null;
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
                const { message, conversationId, conversation } = action.payload;

                if (!state.messagesByConversation[conversationId]) {
                    state.messagesByConversation[conversationId] = [];
                }

                state.messagesByConversation[conversationId].push(message);

                const existingConv = state.conversations.find(c => c._id === conversationId);

                if (!existingConv) {
                    if (conversation) {
                        state.conversations.push(conversation);
                    } else {
                        state.conversations.push({
                            _id: conversationId,
                            otherUser: message?.receiver || null,
                            lastMessage: message,
                        });
                    }
                } else {
                    existingConv.lastMessage = message;
                }
            })
            .addCase(getOrCreateConversation.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getOrCreateConversation.fulfilled, (state, action) => {
                const { conversation, messages } = action.payload;
                const convId = conversation._id;

                const exists = state.conversations.find(c => c._id === convId);
                if (!exists) {
                    state.conversations.push(conversation);
                }

                state.messagesByConversation[convId] = messages;
            })
            .addCase(getOrCreateConversation.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
    },
});

export const {
    receiveMessage,
    resetDirectMessages,
    chooseUserToMessage,
    resetUserToMessage,
    openSearchModal,
    closeSearchModal,
    setCurrentConversation,
    resetCurrentConversation,
} = directMessagesSlice.actions;

export const selectConversations = (state) => state.directMessages.conversations || [];
export const selectMessagesByConversation = (state) => state.directMessages.messagesByConversation || {};
export const selectUserToMessage = (state) => state.directMessages.userToMessage;
export const selectFollowing = (state) => state.directMessages.userToMessage;
export const searchModalVisibility = (state) => state.directMessages.searchModalOpen;
export const selectConversationByUserId = (state, userId) => {
    return state.directMessages.conversations.find(conv =>
        conv.otherUser?._id === userId
    );
};

export default directMessagesSlice.reducer;
