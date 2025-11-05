import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { replacePostInFeeds } from './ReviewsSlice';
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
    async ({ recipientId, inviteId }, { rejectWithValue, dispatch }) => {
      try {
        const { data } = await axios.post(`${API_BASE}/accept`, { recipientId, inviteId });
        const updated = data.invite;
        
        await dispatch(replacePostInFeeds(updated));

        return {
            inviteId,
            status: 'accepted',
            message: data.message,
            invite: data.invite,
        };
      } catch (err) {
        return rejectWithValue(err.response?.data || { message: 'Unknown error' });
      }
    }
);  

export const rejectInvite = createAsyncThunk(
  'invites/rejectInvite',
  async ({ recipientId, inviteId }, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await axios.post(`${API_BASE}/reject`, { recipientId, inviteId });
      const updated = data.invite;

      await dispatch(replacePostInFeeds(updated));

      return {
        inviteId,
        status: 'declined',
        message: data.message,
        invite: updated,
      };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Unknown error' });
    }
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
      const res = await axios.post(`${API_BASE}/request`, {
        userId,
        inviteId,
      });
      return res.data;
    } catch (err) {
      return thunkAPI.rejectWithValue(err.response?.data || 'Request failed');
    }
  }
);

export const acceptInviteRequest = createAsyncThunk(
  'invites/acceptInviteRequest',
  async ({ inviteId, userId }, thunkAPI) => {
    try {
      const response = await axios.post(`${API_BASE}/accept-user-request`, {
        inviteId,
        userId,
      });
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(error.response?.data || 'Failed to accept request');
    }
  }
);

export const rejectInviteRequest = createAsyncThunk(
  'invites/rejectInviteRequest',
  async ({ inviteId, userId }, thunkAPI) => {
    try {
      const response = await axios.post(`${API_BASE}/reject-user-request`, {
        inviteId,
        userId,
      });
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(error.response?.data || 'Failed to reject request');
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
      .addCase(requestInvite.fulfilled, (state, action) => {
        const updatedInvite = action.payload.invite;
      
        state.invites = state.invites.map(invite =>
          invite._id === updatedInvite._id ? updatedInvite : invite
        );
      })      
      .addCase(requestInvite.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(acceptInviteRequest.fulfilled, (state, action) => {
        const updatedInvite = action.payload.invite;
        const index = state.invites.findIndex(invite => invite._id === updatedInvite._id);
        if (index !== -1) {
          state.invites[index] = updatedInvite;
        } else {
          state.invites.push(updatedInvite);
        }
      })   
      .addCase(rejectInviteRequest.fulfilled, (state, action) => {
        const updatedInvite = action.payload.invite;
        const index = state.invites.findIndex(invite => invite._id === updatedInvite._id);
        if (index !== -1) {
          state.invites[index] = updatedInvite;
        } else {
          state.invites.push(updatedInvite);
        }
      })      
  },
});

export default invitesSlice.reducer;

export const selectInvites = (state) => state.invites.invites;
