import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api";
import * as Location from "expo-location";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

const extractErr = (err, fallback) => {
  const msg =
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    fallback;
  return typeof msg === "string" ? msg : fallback;
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const getCurrentCoordinates = createAsyncThunk(
  "location/getCurrentCoordinates",
  async (_, { rejectWithValue }) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        return rejectWithValue("Permission to access location was denied");
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      };
    } catch (error) {
      return rejectWithValue(extractErr(error, "Error getting location"));
    }
  }
);

export const geocodeAddressThunk = createAsyncThunk(
  "location/geocodeAddress",
  async (address, { rejectWithValue }) => {
    try {
      const clean = (address || "").trim();
      if (!clean) return rejectWithValue("Address is required");

      const res = await api.get(`${BASE_URL}/location/geocode`, {
        params: { address: clean },
      });

      const { lat, lng } = res?.data || {};
      if (!isNum(lat) || !isNum(lng)) {
        return rejectWithValue("Could not locate that address.");
      }

      return { lat, lng };
    } catch (err) {
      return rejectWithValue(extractErr(err, "Failed to geocode address."));
    }
  }
);

export const reverseGeocodeThunk = createAsyncThunk(
  "location/reverseGeocode",
  async ({ lat, lng }, { rejectWithValue }) => {
    try {
      if (!isNum(lat) || !isNum(lng)) {
        return rejectWithValue("Invalid coordinates.");
      }

      const res = await api.get(`${BASE_URL}/location/reverse-geocode`, {
        params: { lat, lng },
      });

      const data = res?.data;

      // Support either:
      // 1) { formattedAddress, city, state, country }
      // 2) "formatted address"
      if (typeof data === "string") return data;
      if (data?.formattedAddress && typeof data.formattedAddress === "string") {
        return data.formattedAddress;
      }

      return rejectWithValue("Address not found.");
    } catch (err) {
      return rejectWithValue(extractErr(err, "Failed to reverse geocode."));
    }
  }
);

export const fetchTimezone = createAsyncThunk(
  "location/fetchTimezone",
  async ({ lat, lng }, { rejectWithValue }) => {
    try {
      if (!isNum(lat) || !isNum(lng)) {
        return rejectWithValue("Invalid coordinates.");
      }

      const timestamp = Math.floor(Date.now() / 1000);

      const res = await api.get(`${BASE_URL}/location/timezone`, {
        params: { lat, lng, timestamp },
      });

      const tz = res?.data;
      if (!tz?.timeZoneId) {
        return rejectWithValue("Failed to fetch timezone data");
      }

      return {
        timeZoneId: tz.timeZoneId,
        timeZoneName: tz.timeZoneName,
        rawOffset: tz.rawOffset,
        dstOffset: tz.dstOffset,
      };
    } catch (err) {
      return rejectWithValue(extractErr(err, "Failed to fetch timezone data"));
    }
  }
);

export const getCityStateCountry = createAsyncThunk(
  "location/getCityStateCountry",
  async ({ lat, lng }, { rejectWithValue }) => {
    try {
      if (!isNum(lat) || !isNum(lng)) {
        return rejectWithValue("Invalid coordinates.");
      }

      const res = await api.get(`${BASE_URL}/location/reverse-geocode`, {
        params: { lat, lng },
      });

      const data = res?.data;

      if (typeof data === "string") {
        return rejectWithValue(
          "Backend reverse-geocode must return { city, state, country } (not just a string)."
        );
      }

      return {
        city: data?.city || "",
        state: data?.state || "",
        country: data?.country || "",
      };
    } catch (err) {
      return rejectWithValue(extractErr(err, "Error fetching location details."));
    }
  }
);

export const fetchWeather = createAsyncThunk(
  "location/fetchWeather",
  async ({ lat, lng }, { rejectWithValue }) => {
    try {
      if (!isNum(lat) || !isNum(lng)) {
        return rejectWithValue("Invalid coordinates.");
      }

      const res = await api.get(`${BASE_URL}/weather/current`, {
        params: { lat, lng },
      });

      return res.data;
    } catch (err) {
      return rejectWithValue(extractErr(err, "Error fetching current weather."));
    }
  }
);

export const locationSlice = createSlice({
  name: "location",
  initialState: {
    coordinates: null,
    manualCoordinates: null,
    reverseGeocodeAddress: null,
    locationModalVisible: false,
    location: null, // { city, state, country }
    weather: null,
    timeZone: null,
    status: "idle",
    error: null,
  },
  reducers: {
    resetCoordinates: (state) => {
      state.coordinates = null;
    },
    setCoordinates: (state, action) => {
      state.coordinates = action.payload;
    },
    resetLocation: (state) => {
      state.location = null;
    },
    setManualCoordinates: (state, action) => {
      state.manualCoordinates = action.payload;
    },
    openLocationModal: (state) => {
      state.locationModalVisible = true;
    },
    closeLocationModal: (state) => {
      state.locationModalVisible = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getCurrentCoordinates.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(getCurrentCoordinates.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.coordinates = action.payload;
      })
      .addCase(getCurrentCoordinates.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || action.error.message;
      })

      .addCase(getCityStateCountry.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(getCityStateCountry.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.location = action.payload;
      })
      .addCase(getCityStateCountry.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || action.error.message;
      })

      .addCase(fetchWeather.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchWeather.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.weather = action.payload;
      })
      .addCase(fetchWeather.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || action.error.message;
      })

      .addCase(fetchTimezone.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchTimezone.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.timeZone = action.payload;
      })
      .addCase(fetchTimezone.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || action.error.message;
      })

      .addCase(geocodeAddressThunk.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(geocodeAddressThunk.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.manualCoordinates = {
          lat: action.payload.lat,
          lng: action.payload.lng,
        };
      })
      .addCase(geocodeAddressThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || "Geocoding failed";
      })

      .addCase(reverseGeocodeThunk.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(reverseGeocodeThunk.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.reverseGeocodeAddress = action.payload;
      })
      .addCase(reverseGeocodeThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || "Reverse geocoding failed";
      });
  },
});

export default locationSlice.reducer;

export const {
  resetCoordinates,
  resetLocation,
  setCoordinates,
  openLocationModal,
  closeLocationModal,
  setManualCoordinates,
} = locationSlice.actions;

export const selectCoordinates = (state) => state.location.coordinates;
export const selectLocation = (state) => state.location.location;
export const selectWeather = (state) => state.location.weather;
export const selectTimeZone = (state) => state.location.timeZone;
export const selectReverseGeocodeAddress = (state) => state.location.reverseGeocodeAddress;
export const selectManualCoordinates = (state) => state.location.manualCoordinates;
export const selectLocationModalVisible = (state) => state.location.locationModalVisible;
