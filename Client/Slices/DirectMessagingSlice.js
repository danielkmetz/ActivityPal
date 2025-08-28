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
            console.error('❌ Error sending message:', err.response?.data || err.message);
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

export const deleteMessage = createAsyncThunk(
    'directMessages/deleteMessage',
    async ({ conversationId, messageId }, { rejectWithValue }) => {
        try {
            const token = await getUserToken();

            await axios.delete(`${API_URL}/message/${messageId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            return { conversationId, messageId };
        } catch (err) {
            return rejectWithValue(err.response?.data || 'Error deleting message');
        }
    }
);

export const editMessage = createAsyncThunk(
    'directMessages/editMessage',
    async ({ messageId, content, media }, { rejectWithValue }) => {
        try {
            const token = await getUserToken();

            const res = await axios.put(
                `${API_URL}/message/${messageId}`,
                { content, media },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            return res.data.message;
        } catch (err) {
            return rejectWithValue(err.response?.data || 'Error editing message');
        }
    }
);

export const markMessagesAsRead = createAsyncThunk(
    'messages/markAsRead',
    async (conversationId, { rejectWithValue }) => {
        try {
            const token = await getUserToken();

            const res = await axios.put(`${API_URL}/messages/read/${conversationId}`, null, {
                headers: {
                    Authorization: `Bearer ${token}`,
                }
            });
            return { conversationId, updated: res.data.updated };
        } catch (err) {
            return rejectWithValue(err.response?.data || { error: 'Failed to mark messages as read' });
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
        receiveMessage: (state, action) => {
            const message = action.payload;
            const convId = message.conversationId;

            if (!state.messagesByConversation[convId]) {
                state.messagesByConversation[convId] = [];
            }
            state.messagesByConversation[convId].push(message);

            // keep lastMessage up to date
            const conv = state.conversations.find(c => c._id === convId);
            if (conv) conv.lastMessage = message;
        },

        receiveMessageEdited: (state, action) => {
            const updated = action.payload; // { _id, conversationId, ... }
            const convId = updated.conversationId;
            const list = state.messagesByConversation[convId];
            if (list) {
                const i = list.findIndex(m => m._id === updated._id);
                if (i !== -1) {
                    list[i] = { ...list[i], ...updated };
                }
            }
            // update conversation.lastMessage if it’s the one edited
            const conv = state.conversations.find(c => c._id === convId);
            if (conv?.lastMessage?._id === updated._id) {
                conv.lastMessage = { ...conv.lastMessage, ...updated };
            }
        },

        receiveMessageDeleted: (state, action) => {
            const { conversationId, messageId } = action.payload;
            const list = state.messagesByConversation[conversationId];
            if (list) {
                const beforeLen = list.length;
                state.messagesByConversation[conversationId] = list.filter(m => m._id !== messageId);

                // if lastMessage was deleted, backfill with new tail (if any)
                const conv = state.conversations.find(c => c._id === conversationId);
                if (conv && conv.lastMessage?._id === messageId) {
                    const newList = state.messagesByConversation[conversationId];
                    conv.lastMessage = newList?.[newList.length - 1] || null;
                }
            }
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
            .addCase(deleteMessage.fulfilled, (state, action) => {
                const { conversationId, messageId } = action.payload;
                const messages = state.messagesByConversation[conversationId];

                if (messages) {
                    state.messagesByConversation[conversationId] = messages.filter(
                        (msg) => msg._id !== messageId
                    );
                }

                // Optionally update lastMessage in conversation if needed
                const conv = state.conversations.find((c) => c._id === conversationId);
                if (conv && conv.lastMessage?._id === messageId) {
                    const updatedMessages = state.messagesByConversation[conversationId];
                    conv.lastMessage = updatedMessages?.[updatedMessages.length - 1] || null;
                }
            })
            .addCase(deleteMessage.rejected, (state, action) => {
                state.error = action.payload;
            })
            .addCase(editMessage.fulfilled, (state, action) => {
                const updatedMessage = action.payload;
                const convId = updatedMessage.conversationId;

                if (state.messagesByConversation[convId]) {
                    const index = state.messagesByConversation[convId].findIndex(
                        (msg) => msg._id === updatedMessage._id
                    );

                    if (index !== -1) {
                        state.messagesByConversation[convId][index] = updatedMessage;
                    }
                }
            })
            .addCase(markMessagesAsRead.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(markMessagesAsRead.fulfilled, (state, action) => {
                const { conversationId } = action.payload;

                const conversation = state.conversations.find(conv => conv._id === conversationId);
                if (conversation?.lastMessage) {
                    conversation.lastMessage.isRead = true; // ✅ Update for immediate UI sync
                }
                state.status = 'succeeded';
            })
            .addCase(markMessagesAsRead.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload?.error || 'Something went wrong';
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
