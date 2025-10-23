import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

export const fetchBlocks = createAsyncThunk('blocks/fetch', async () => {
  const { data } = await axios.get(`${BASE_URL}/api/blocks/me`);
  return data; // { blocked: [], blockedBy: [] }
});

export const blockUser = createAsyncThunk('blocks/block', async (targetId) => {
  await axios.post(`${BASE_URL}/api/blocks/${targetId}`);
  return targetId;
});

export const unblockUser = createAsyncThunk('blocks/unblock', async (targetId) => {
  await axios.delete(`${BASE_URL}/api/blocks/${targetId}`);
  return targetId;
});

const BlocksSlice = createSlice({
  name: 'blocks',
  initialState: { blocked: [], blockedBy: [], status: 'idle' },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBlocks.fulfilled, (s, a) => {
        s.blocked = a.payload.blocked;
        s.blockedBy = a.payload.blockedBy;
        s.status = 'succeeded';
      })
      .addCase(blockUser.fulfilled, (s, a) => {
        if (!s.blocked.includes(a.payload)) s.blocked.push(a.payload);
      })
      .addCase(unblockUser.fulfilled, (s, a) => {
        s.blocked = s.blocked.filter(id => id !== a.payload);
      });
  },
});

export const selectBlocked = (state) => state.blocks.blocked;
export const selectBlockedBy = (state) => state.blocks.blockedBy;
export default BlocksSlice.reducer;
