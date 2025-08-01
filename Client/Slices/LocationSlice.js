import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from 'axios';
import * as Location from 'expo-location';

const apiKey = process.env.EXPO_PUBLIC_GOOGLE_KEY;
const weatherKey = process.env.EXPO_PUBLIC_WEATHER;

const fetchWeatherData = async (lat, lng) => {
    const url = `https://api.weatherapi.com/v1/current.json`;

    try {
        const response = await axios.get(url, {
            params: {
                key: weatherKey, // Your Weather API key
                q: `${lat},${lng}`, // Latitude and Longitude
                aqi: 'no', // No air quality index data
            },
        });

        return response.data.current; // Return the current weather data
    } catch (error) {
        console.error('Error fetching current weather:', error);
        throw error;
    }
};

export const getCurrentCoordinates = createAsyncThunk(
    'location/getCurrentCoordinates',
    async (_, { rejectWithValue }) => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();

            if (status !== 'granted') {
                return rejectWithValue('Permission to access location was denied');
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            return {
                lat: location.coords.latitude,
                lng: location.coords.longitude,
            };
        } catch (error) {
            console.error("Error getting location:", error);
            return rejectWithValue(error.message);
        }
    }
);

export const geocodeAddressThunk = createAsyncThunk(
    'location/geocodeAddress',
    async (address, { rejectWithValue }) => {
        try {
            const encodedAddress = encodeURIComponent(address);
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'OK' && data.results.length > 0) {
                return data.results[0].geometry.location; // { lat, lng }
            } else {
                return rejectWithValue('Could not locate that address.');
            }
        } catch (err) {
            return rejectWithValue('Failed to geocode address.');
        }
    }
);

export const reverseGeocodeThunk = createAsyncThunk(
    'location/reverseGeocode',
    async ({ lat, lng }, { rejectWithValue }) => {
        try {
            const res = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`
            );
            const data = await res.json();

            if (data.status === 'OK' && data.results.length > 0) {
                return data.results[0].formatted_address;
            } else {
                return rejectWithValue('Address not found.');
            }
        } catch (err) {
            return rejectWithValue('Failed to reverse geocode.');
        }
    }
);

export const fetchTimezone = createAsyncThunk(
    'location/fetchTimezone',
    async (coordinates) => {
        const { lat, lng } = coordinates;
        const url = `https://maps.googleapis.com/maps/api/timezone/json`;
        const timestamp = Math.floor(Date.now() / 1000); // Current timestamp in seconds

        try {
            const response = await axios.get(url, {
                params: {
                    location: `${lat},${lng}`,
                    timestamp: timestamp,
                    key: apiKey,
                },
            });

            if (response.data.status === "OK") {
                return {
                    timeZoneId: response.data.timeZoneId, // e.g., "America/Chicago"
                    timeZoneName: response.data.timeZoneName, // e.g., "Central Standard Time"
                    rawOffset: response.data.rawOffset, // UTC offset in seconds
                    dstOffset: response.data.dstOffset, // Daylight saving offset in seconds
                };
            } else {
                throw new Error(response.data.errorMessage || "Failed to fetch timezone data");
            }
        } catch (error) {
            console.error("Error fetching timezone:", error);
            return null;
        }
    }
)

export const getCityStateCountry = createAsyncThunk(
    'location/getCityStateCountry',
    async (coordinates) => {
        const { lat } = coordinates;
        const { lng } = coordinates;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;

        try {
            const response = await axios.get(url);

            if (response.data.status === 'OK') {
                const results = response.data.results;
                // Assuming the first result contains the most accurate location information
                const addressComponents = results[0].address_components;

                let city = '';
                let state = '';
                let country = '';

                // Parse the address components to get city, state, and country
                addressComponents.forEach(component => {
                    if (component.types.includes('locality')) {
                        city = component.long_name;
                    }
                    if (component.types.includes('administrative_area_level_1')) {
                        state = component.long_name;
                    }
                    if (component.types.includes('country')) {
                        country = component.long_name;
                    }
                });

                return { city, state, country };
            } else {
                console.error('No results found for the provided coordinates.');
                return null;
            }
        } catch (error) {
            console.error('Error fetching location details:', error);
        }
    }
);

export const fetchWeather = createAsyncThunk(
    'location/fetchWeather',
    async (coordinates) => {
        const { lat, lng } = coordinates;

        try {

            const data = fetchWeatherData(lat, lng);
            return data;

        } catch (error) {
            console.error(error);
        }
    }
)

export const locationSlice = createSlice({
    name: 'location',
    initialState: {
        coordinates: null,
        manualCoordinates: null,
        reverseGeocodeAddress: null,
        locationModalVisible: false,
        location: null,
        weather: null,
        timeZone: null,
        status: 'idle',
        error: null,
    },
    reducers: {
        resetCoordinates: (state, action) => {
            state.coordinates = null;
        },
        setCoordinates: (state, action) => {
            state.coordinates = action.payload;
        },
        resetLocation: (state, action) => {
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
                state.status = 'loading';
            })
            .addCase(getCurrentCoordinates.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.coordinates = action.payload;
            })
            .addCase(getCurrentCoordinates.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message;
            })
            .addCase(getCityStateCountry.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(getCityStateCountry.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.location = action.payload;
            })
            .addCase(getCityStateCountry.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message;
            })
            .addCase(fetchWeather.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchWeather.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.weather = action.payload;
            })
            .addCase(fetchWeather.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message;
            })
            .addCase(fetchTimezone.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchTimezone.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.timeZone = action.payload;
            })
            .addCase(fetchTimezone.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message;
            })
            .addCase(geocodeAddressThunk.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(geocodeAddressThunk.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.manualCoordinates = {
                    lat: action.payload.lat,
                    lng: action.payload.lng,
                };
            })
            .addCase(geocodeAddressThunk.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload || 'Geocoding failed';
            })
            .addCase(reverseGeocodeThunk.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(reverseGeocodeThunk.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.reverseGeocodeAddress = action.payload;
            })
            .addCase(reverseGeocodeThunk.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload || 'Reverse geocoding failed';
            })
    }
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

