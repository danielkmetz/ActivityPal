import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_BASE = `${process.env.EXPO_PUBLIC_SERVER_URL}/recent-searches`; // ✅ update if using a different base

// Fetch recent searches
export const fetchRecentSearches = createAsyncThunk(
    'recentSearches/fetch',
    async (userId, thunkAPI) => {
        try {
            const response = await axios.get(`${API_BASE}/${userId}/searches`);
            return response.data;
        } catch (err) {
            return thunkAPI.rejectWithValue(err.response?.data || 'Fetch failed');
        }
    }
);

// Add a new search (by userId + query string)
export const addRecentSearch = createAsyncThunk(
    'recentSearches/add',
    async ({ userId, query }, thunkAPI) => {
        try {
            const response = await axios.post(`${API_BASE}/${userId}/searches`, { query });
            return response.data.recentSearch;
        } catch (err) {
            return thunkAPI.rejectWithValue(err.response?.data || 'Add failed');
        }
    }
);

// Delete one search by queryId
export const deleteRecentSearch = createAsyncThunk(
    'recentSearches/deleteOne',
    async ({ userId, queryId }, thunkAPI) => {
        try {
            const response = await axios.delete(`${API_BASE}/${userId}/searches/${queryId}`);
            return queryId;
        } catch (err) {
            return thunkAPI.rejectWithValue(err.response?.data || 'Delete failed');
        }
    }
);

// Delete all
export const clearAllRecentSearches = createAsyncThunk(
    'recentSearches/clearAll',
    async (userId, thunkAPI) => {
        try {
            const response = await axios.delete(`${API_BASE}/${userId}/searches`);
            return response.data.recentSearches;
        } catch (err) {
            return thunkAPI.rejectWithValue(err.response?.data || 'Clear failed');
        }
    }
);

// Slice
const recentSearchesSlice = createSlice({
    name: 'recentSearches',
    initialState: {
        recent: [],
        loading: false,
        error: null,
    },
    reducers: {
        resetRecentSearches: (state) => {
            state.recent = [];
            state.error = null;
            state.loading = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchRecentSearches.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchRecentSearches.fulfilled, (state, action) => {
                state.loading = false;
                state.recent = action.payload;
            })
            .addCase(fetchRecentSearches.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(addRecentSearch.fulfilled, (state, action) => {
                // Ensure no duplicates (in case backend didn't enforce it)
                const newEntry = action.payload;
                state.recent = [
                    newEntry,
                    ...state.recent.filter(entry => entry.queryId !== newEntry.queryId)
                ].slice(0, 10); // limit to 10 if needed
            })
            .addCase(deleteRecentSearch.fulfilled, (state, action) => {
                const deletedQueryId = action.meta.arg.queryId; // sent in thunk params
                state.recent = state.recent.filter(item => item.queryId !== deletedQueryId);
            })
            .addCase(clearAllRecentSearches.fulfilled, (state, action) => {
                state.recent = [];
            });
    },
});

export const { resetRecentSearches } = recentSearchesSlice.actions;

export const selectRecentSearches = (state) => state.recentSearches.recent;
export const selectRecentSearchesLoading = (state) => state.recentSearches.loading;
export const selectRecentSearchesError = (state) => state.recentSearches.error;

export default recentSearchesSlice.reducer;
