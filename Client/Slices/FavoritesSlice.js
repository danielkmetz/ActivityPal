import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getUserToken } from "../functions";
import axios from "axios";

const API_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}`;

// Async Thunks
export const addFavorite = createAsyncThunk(
    "favorites/addFavorite",
    async ({ userId, placeId }, { rejectWithValue }) => {
        try {
            const response = await axios.post(`${API_URL}/favorites/${userId}/${placeId}`);
            return response.data.favorites;
        } catch (error) {
            return rejectWithValue(error.response ? error.response.data : error.message);
        }
    }
);

export const fetchFavorites = createAsyncThunk(
    "favorites/fetchFavorites",
    async (userId, { rejectWithValue }) => {
        try {
            const response = await axios.get(`${API_URL}/favorites/users/${userId}`);
            return response.data.favorites; // Returns the list of favorite establishments
        } catch (error) {
            return rejectWithValue(error.response ? error.response.data : error.message);
        }
    }
);

export const removeFavorite = createAsyncThunk(
    "favorites/removeFavorite",
    async ({ userId, placeId }, { rejectWithValue }) => {
        try {
            const response = await axios.delete(`${API_URL}/favorites/${userId}/${placeId}`);
            return response.data.favorites; // Returns updated favorites array
        } catch (error) {
            return rejectWithValue(error.response ? error.response.data : error.message);
        }
    }
);

export const fetchFavoritedDetails = createAsyncThunk(
    "favorites/fetchFavoritedDetails",
    async (businessIds, { rejectWithValue }) => {
      try {
        const token = await getUserToken();

        const response = await axios.post(`${API_URL}/businessUsers/favorites`, 
            {businessIds},
            {headers: {
                Authorization: `Bearer ${token}`
            }}
        );
  
        return response.data.businesses; // Returns array of business objects
      } catch (error) {
        return rejectWithValue(error.response ? error.response.data : error.message);
      }
    }
);

export const fetchOtherUserFavorites = createAsyncThunk(
    "favorites/fetchOtherUserFavorites",
    async (userId, { rejectWithValue }) => {
        try {
            const response = await axios.get(`${API_URL}/favorites/users/${userId}`);
            return response.data.favorites; // Returns the list of favorite establishments
        } catch (error) {
            return rejectWithValue(error.response ? error.response.data : error.message);
        }
    }
);

export const fetchOtherUserFavoritedDetails = createAsyncThunk(
    "favorites/fetchOtherUserFavoritedDetails",
    async (businessIds, { rejectWithValue }) => {
      try {
        const token = await getUserToken();

        const response = await axios.post(`${API_URL}/businessUsers/favorites`, 
            {businessIds},
            {headers: {
                Authorization: `Bearer ${token}`
            }}
        );
  
        return response.data.businesses; // Returns array of business objects
      } catch (error) {
        return rejectWithValue(error.response ? error.response.data : error.message);
      }
    }
);

const favoritesSlice = createSlice({
    name: "favorites",
    initialState: {
        favorites: [],
        otherUserFavorites: [],
        favoritedDetails: [],
        otherUserFavorites: [],
        otherUserFavoritedDetails: [],
        status: "idle",
        error: null,
    },
    reducers: {
        setFavorites: (state, action) => {
            state.favorites = action.payload;
        },
        resetFavorites: (state) => {
            state.favorites = [];
        },
        setFavoritedDetails: (state, action) => {
            state.favoritedDetails = action.payload;
        },
        resetFavoritedDetails: (state) => {
            state.favoritedDetails = [];
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(addFavorite.pending, (state) => {
                state.status = "loading";
            })
            .addCase(addFavorite.fulfilled, (state, action) => {
                state.status = "succeeded";
                state.favorites = action.payload;
            })
            .addCase(addFavorite.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload;
            })
            .addCase(fetchFavorites.pending, (state) => {
                state.status = "loading";
            })
            .addCase(fetchFavorites.fulfilled, (state, action) => {
                state.status = "succeeded";
                state.favorites = action.payload;
            })
            .addCase(fetchFavorites.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload;
            })
            .addCase(removeFavorite.pending, (state) => {
                state.status = "loading";
            })
            .addCase(removeFavorite.fulfilled, (state, action) => {
                state.status = "succeeded";
                state.favorites = action.payload;
            })
            .addCase(removeFavorite.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload;
            })
            .addCase(fetchFavoritedDetails.pending, (state) => {
                state.status = "loading";
            })
            .addCase(fetchFavoritedDetails.fulfilled, (state, action) => {
                state.status = "succeeded";
                state.favoritedDetails = action.payload;
            })
            .addCase(fetchFavoritedDetails.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload;
            })
            .addCase(fetchOtherUserFavorites.pending, (state) => {
                state.status = "loading";
            })
            .addCase(fetchOtherUserFavorites.fulfilled, (state, action) => {
                state.status = "succeeded";
                state.otherUserFavorites = action.payload;
            })
            .addCase(fetchOtherUserFavorites.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload;
            })
            .addCase(fetchOtherUserFavoritedDetails.pending, (state) => {
                state.status = "loading";
            })
            .addCase(fetchOtherUserFavoritedDetails.fulfilled, (state, action) => {
                state.status = "succeeded";
                state.otherUserFavoritedDetails = action.payload;
            })
            .addCase(fetchOtherUserFavoritedDetails.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload;
            })

    },
});

export default favoritesSlice.reducer;

export const selectFavorites = (state) => state.favorites.favorites || [];
export const selectFavoritedDetails = (state) => state.favorites.favoritedDetails || [];
export const selectFavoritesStatus = (state) => state.favorites.status || [];
export const selectOtherUserFavorites = (state) => state.favorites.otherUserFavorites || [];
export const selectOtherUserFavoritedDetails = (state) => state.favorites.otherUserFavoritedDetails || [];

export const { setFavorites, resetFavorites, setFavoritedDetails, resetFavoritedDetails } = favoritesSlice.actions;
