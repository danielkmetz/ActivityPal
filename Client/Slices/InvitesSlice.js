import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_BASE = `${process.env.EXPO_PUBLIC_SERVER_URL}/activity-invite`;

// Thunks
export const fetchInvites = createAsyncThunk(
  'invites/fetchInvites',
  async (userId) => {
    const response = await axios.get(`${API_BASE}/user/${userId}/invites`);
    return response.data.invites;
  }
);

export const sendInvite = createAsyncThunk(
  'invites/sendInvite',
  async (inviteData) => {
    const response = await axios.post(`${API_BASE}/send`, inviteData);
    return response.data; // optional: return updated invites
  }
);

export const acceptInvite = createAsyncThunk(
    'invites/acceptInvite',
    async ({ recipientId, inviteId }, { rejectWithValue }) => {
      try {
        const response = await axios.post(`${API_BASE}/accept`, { recipientId, inviteId });
  
        // Optional: return any data the backend might respond with (like updated invite)
        return {
            inviteId,
            status: 'accepted',
            message: response.data.message,
            invite: response.data.invite,
        };
      } catch (err) {
        return rejectWithValue(err.response?.data || { message: 'Unknown error' });
      }
    }
);  

export const rejectInvite = createAsyncThunk(
    'invites/rejectInvite',
    async ({ recipientId, inviteId }) => {
      const response = await axios.post(`${API_BASE}/reject`, { recipientId, inviteId });
      return {
        inviteId,
        status: 'declined',
        message: response.data.message,
        invite: response.data.invite,
      }; // Return the enriched invite from the backend
    }
);
  
export const deleteInvite = createAsyncThunk(
  'invites/deleteInvite',
  async ({ senderId, inviteId, recipientIds }) => {
    const response = await axios.delete(`${API_BASE}/delete`, {
      data: { senderId, inviteId, recipientIds },
    });
    return inviteId;
  }
)

export const editInvite = createAsyncThunk(
    'invites/editInvite',
    async ({ recipientId, inviteId, updates, recipientIds }, {rejectWithValue}) => {
      try {
        const response = await axios.put(`${API_BASE}/edit`, {
          recipientId,
          inviteId,
          updates,
          recipientIds,
        });
        return response.data.updatedInvite;
      } catch (error) {
        return rejectWithValue(error.response?.data || 'Error editing invite');
      }
    }
);

export const requestInvite = createAsyncThunk(
  'invites/requestInvite',
  async ({ userId, inviteId }, thunkAPI) => {
    try {
      const res = await axios.post(`/api/activity-invites/request`, {
        userId,
        inviteId,
      });
      return res.data;
    } catch (err) {
      return thunkAPI.rejectWithValue(err.response?.data || 'Request failed');
    }
  }
);

// Slice
const invitesSlice = createSlice({
  name: 'invites',
  initialState: {
    invites: [],
    status: 'idle',
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchInvites.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchInvites.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.invites = action.payload;
      })
      .addCase(fetchInvites.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(sendInvite.fulfilled, (state, action) => {
        const newInvite = action.payload.invite;
        if (newInvite) {
          state.invites.push(newInvite);
        }
      })
      .addCase(acceptInvite.fulfilled, (state, action) => {
        const updated = action.payload.invite;
        const index = state.invites.findIndex(inv => inv._id === updated._id);
        if (index !== -1) {
          state.invites[index] = updated;
        }
      })
      .addCase(rejectInvite.fulfilled, (state, action) => {
        const updated = action.payload.invite;
        const index = state.invites.findIndex(inv => inv._id === updated._id);
        if (index !== -1) {
          state.invites[index] = updated;
        }
      })      
      .addCase(deleteInvite.fulfilled, (state, action) => {
        state.invites = state.invites.filter(inv => inv._id !== action.payload);
      })
      .addCase(editInvite.fulfilled, (state, action) => {
        const updatedInvite = action.payload;
        const index = state.invites.findIndex(invite => invite._id === updatedInvite._id);
        if (index !== -1) {
          state.invites[index] = updatedInvite; // 🔄 replace the existing invite
        }
      })
  },
});

export default invitesSlice.reducer;

export const selectInvites = (state) => state.invites.invites;
