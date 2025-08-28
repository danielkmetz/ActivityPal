import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getAuthHeaders } from '../utils/Authorization/getAuthHeaders';

const CHAT_API = `${process.env.EXPO_PUBLIC_API_BASE_URL}/live-chat`;

/** Fetch recent chat (forward pagination from newest) */
export const fetchRecentChat = createAsyncThunk(
  'liveChat/fetchRecentChat',
  async ({ liveStreamId, after, limit = 50 }, { rejectWithValue }) => {
    try {
      const auth = await getAuthHeaders();
      const url = after
        ? `${CHAT_API}/${liveStreamId}/chat?after=${encodeURIComponent(after)}&limit=${limit}`
        : `${CHAT_API}/${liveStreamId}/chat?limit=${limit}`;
      const { data } = await axios.get(url, auth);
      const items = data.items || data || [];
      return { liveStreamId, items };
    } catch (e) {
      return rejectWithValue({ liveStreamId, error: e.response?.data || 'Failed to fetch chat' });
    }
  }
);

/** Fetch a replay-synchronized slice (by offset seconds) */
export const fetchChatReplaySlice = createAsyncThunk(
  'liveChat/fetchChatReplaySlice',
  async ({ liveStreamId, from = 0, to = 60 }, { rejectWithValue }) => {
    try {
      const auth = await getAuthHeaders();
      const { data } = await axios.get(`${CHAT_API}/${liveStreamId}/chat/replay?from=${from}&to=${to}`, auth);
      const items = data.items || [];
      return { liveStreamId, items };
    } catch (e) {
      return rejectWithValue({ liveStreamId, error: e.response?.data || 'Failed to fetch replay' });
    }
  }
);

const initialState = {
  connected: false,
  byId: {
    // [liveStreamId]: {
    //   messages: [],
    //   pinnedMessageId: null,
    //   typing: {}, // { [userId]: lastSeenTs }
    //   joined: false,
    //   loading: false,
    //   error: null,
    // }
  },
};

function ensureStream(state, liveStreamId) {
  if (!state.byId[liveStreamId]) {
    state.byId[liveStreamId] = {
      messages: [],
      pinnedMessageId: null,
      typing: {},
      joined: false,
      loading: false,
      error: null,
    };
  }
  return state.byId[liveStreamId];
}

function upsertMessage(list, incoming) {
  // de-dupe by _id or localId, then replace or push
  const byIdIdx = incoming._id ? list.findIndex(m => m._id === incoming._id) : -1;
  if (byIdIdx !== -1) {
    list[byIdIdx] = { ...list[byIdIdx], ...incoming, pending: false };
    return;
  }
  if (incoming.localId) {
    const localIdx = list.findIndex(m => m.localId === incoming.localId);
    if (localIdx !== -1) {
      list[localIdx] = { ...list[localIdx], ...incoming, pending: false };
      return;
    }
  }
  list.push(incoming);
  // (optional) cap memory
  if (list.length > 800) list.splice(0, list.length - 800);
}

const liveChatSlice = createSlice({
  name: 'liveChat',
  initialState,
  reducers: {
    setLiveConnected(state, action) {
      state.connected = !!action.payload;
    },
    setJoined(state, action) {
      const { liveStreamId, joined } = action.payload;
      ensureStream(state, liveStreamId).joined = !!joined;
    },
    receiveLiveMessage(state, action) {
      const msg = action.payload;
      const { liveStreamId } = msg;
      const s = ensureStream(state, liveStreamId);
      upsertMessage(s.messages, msg);
    },
    receiveLiveDeleted(state, action) {
      const { liveStreamId, messageId } = action.payload;
      const s = ensureStream(state, liveStreamId);
      s.messages = s.messages.filter(m => m._id !== messageId);
      if (s.pinnedMessageId && String(s.pinnedMessageId) === String(messageId)) {
        s.pinnedMessageId = null;
      }
    },
    setPinnedMessage(state, action) {
      const { liveStreamId, messageId } = action.payload; // messageId can be null (unpin)
      ensureStream(state, liveStreamId).pinnedMessageId = messageId || null;
    },
    setTyping(state, action) {
      const { liveStreamId, userId, isTyping } = action.payload;
      const s = ensureStream(state, liveStreamId);
      if (isTyping) {
        s.typing[userId] = Date.now();
      } else {
        delete s.typing[userId];
      }
    },
    addOptimistic(state, action) {
      const { liveStreamId, optimistic } = action.payload; // must include localId
      ensureStream(state, liveStreamId).messages.push(optimistic);
    },
    removeOptimistic(state, action) {
      const { liveStreamId, localId } = action.payload;
      const s = ensureStream(state, liveStreamId);
      s.messages = s.messages.filter(m => m.localId !== localId);
    },
    clearLiveChat(state, action) {
      const { liveStreamId } = action.payload;
      if (state.byId[liveStreamId]) delete state.byId[liveStreamId];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecentChat.pending, (state, action) => {
        const { liveStreamId } = action.meta.arg || {};
        ensureStream(state, liveStreamId).loading = true;
      })
      .addCase(fetchRecentChat.fulfilled, (state, action) => {
        const { liveStreamId, items } = action.payload;
        const s = ensureStream(state, liveStreamId);
        s.loading = false;
        s.error = null;
        items.forEach(item => upsertMessage(s.messages, item));
        // keep messages sorted ascending by createdAt if needed
        s.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      })
      .addCase(fetchRecentChat.rejected, (state, action) => {
        const { liveStreamId, error } = action.payload || {};
        const s = ensureStream(state, liveStreamId);
        s.loading = false;
        s.error = error || 'Failed to fetch chat';
      })
      .addCase(fetchChatReplaySlice.fulfilled, (state, action) => {
        const { liveStreamId, items } = action.payload;
        const s = ensureStream(state, liveStreamId);
        items.forEach(item => upsertMessage(s.messages, item));
        s.messages.sort((a, b) => (a.offsetSec ?? 0) - (b.offsetSec ?? 0));
      });
  },
});

export const {
  setLiveConnected,
  setJoined,
  receiveLiveMessage,
  receiveLiveDeleted,
  setPinnedMessage,
  setTyping,
  addOptimistic,
  removeOptimistic,
  clearLiveChat,
} = liveChatSlice.actions;

export const selectLiveChatState = (state, liveStreamId) => state.liveChat.byId[liveStreamId] || {};
export const selectLiveMessages = (state, liveStreamId) => (state.liveChat.byId[liveStreamId]?.messages) || [];
export const selectLivePinnedId = (state, liveStreamId) => state.liveChat.byId[liveStreamId]?.pinnedMessageId || null;
export const selectLiveTypingMap = (state, liveStreamId) => state.liveChat.byId[liveStreamId]?.typing || {};
export const selectLiveConnected = (state) => state.liveChat.connected;

export default liveChatSlice.reducer;
