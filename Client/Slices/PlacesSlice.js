import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import haversine from 'haversine-distance';
import { getUserToken } from "../functions";
import { GET_BUSINESS_RATING_SUMMARIES } from "./GraphqlQueries/Queries/businessRatingSummary";
import axios from 'axios';
import client from '../apolloClient';

const apiKey = process.env.EXPO_PUBLIC_GOOGLE_KEY;
const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

const activityTypeKeywords = {
    Dining: [
        'restaurant', 'cafe', 'bistro', 'brunch', 'tapas', 'steakhouse', 'seafood', 'barbecue',
        'pizza', 'sushi', 'brewery', 'wine bar', 'rooftop bar', 'food truck'
    ],
    Entertainment: [
        'comedy club', 'live music', 'karaoke', 'theater', 'concert', 'escape room', 'arcade',
        'billiards', 'nightclub', 'laser tag', 'virtual reality', 'trampoline park'
    ],
    Outdoor: [
        'hiking', 'park', 'trail', 'beach', 'lake', 'fishing', 'golf course', 'kayaking',
        'farmers market', 'zoo', 'botanical garden', 'campground', 'climbing gym outdoor'
    ],
    Indoor: [
        'bowling', 'indoor trampoline', 'museum', 'aquarium', 'art gallery', 'indoor golf',
        'arcade', 'escape room', 'indoor skydiving', 'indoor climbing', 'indoor mini golf',
        'indoor go kart'
    ],
    Family: [
        'children’s museum', 'playground', 'petting zoo', 'kid friendly cafe', 'indoor playground',
        'family bowling', 'puppet theater', 'story time', 'mini golf', 'ice cream shop'
    ],
};

const quickFilters = {
    dateNight: ['restaurant', 'bar', 'top golf', 'bowling', 'movie theater'],
    drinksAndDining: ['restaurant', 'bar', 'cafe', 'brewery', 'winery', 'cocktail bar'],
    outdoor: ['park', 'hiking', 'beach', 'lake', 'campground', 'botanical garden'],
    movieNight: ['movie theater', 'drive-in theater', 'IMAX'],
    budgetFriendly: ['establishment'],
    gaming: ['arcade', 'bowling', 'escape room', 'laser tag'],
    artAndCulture: ['museum', 'art gallery'],
    familyFun: ['amusement park', 'zoo', 'aquarium', 'trampoline park', 'family entertainment', 'museum'],
    petFriendly: ['pet friendly', 'pet friendly restaurant'],
    liveMusic: ['live music venue', 'concert hall', 'jazz club', 'music festival', 'karaoke bar', 'rooftop bar with live music', 'patio', 'outdoor seating'],
    whatsClose: ['establishment', 'entertainment'],
};

export const fetchNearbyPlaces = createAsyncThunk(
    'places/fetchNearbyPlaces',
    async ({ lat, lng, radius, budget, activityType, isCustom = false }) => {
        try {
            const isBudgetFriendly = activityType === 'budgetFriendly';
            const keywords = isBudgetFriendly
                ? ['']
                : isCustom
                    ? (activityTypeKeywords[activityType] || [])
                    : (quickFilters[activityType] || []);

            // Define a function to filter and format place results
            const filterAndFormatPlaces = (places) => {
                return places
                    .filter(place =>
                        !place.types.includes("school") &&
                        !place.types.includes("doctor") &&
                        !place.types.includes("hospital") &&
                        !place.types.includes("lodging") &&
                        !place.types.includes("airport") &&
                        !place.types.includes("store") &&
                        !place.types.includes("storage") &&
                        !place.types.includes("golf_course") && // Exclude golf courses by type
                        !place.types.includes("meal_takeaway") &&
                        !/Country Club|Golf Course|Golf Club|Links/i.test(place.name) && // Exclude by name
                        !(activityType === "gaming" && (
                            place.types.includes("park") ||
                            place.types.includes("restaurant") ||
                            place.types.includes("meal_takeaway") ||
                            place.types.includes("meal_delivery") ||
                            place.types.includes("cafe") ||
                            place.types.includes("food") ||
                            place.types.includes("bakery") ||
                            place.types.includes("bar")
                        )) &&
                        place.opening_hours?.open_now &&
                        (
                            (isBudgetFriendly && (place.price_level === 0 || place.price_level === 1)) ||
                            (budget === "$" && (place.price_level === 0 || place.price_level === 1)) ||
                            (budget === "$$" && (place.price_level <= 2)) ||
                            (budget === "$$$" && (place.price_level <= 3)) ||
                            (budget === "$$$$")
                        )
                    )
                    .map(place => ({
                        ...place,
                        photoUrl: place.photos
                            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
                            : null,
                    }));
            };

            // Fetch places for each keyword in parallel
            const allPlaces = (await Promise.all(keywords.map(async (keyword) => {
                let placesForKeyword = [];
                let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=establishment&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;
                let nextPageToken = null;

                do {
                    const response = await axios.get(url);
                    placesForKeyword = [...placesForKeyword, ...filterAndFormatPlaces(response.data.results)];

                    nextPageToken = response.data.next_page_token;
                    if (nextPageToken) {
                        url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=establishment&keyword=${encodeURIComponent(keyword)}&pagetoken=${nextPageToken}&key=${apiKey}`;
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Avoid hitting rate limits
                    }
                } while (nextPageToken);

                return placesForKeyword;
            }))).flat(); // Flatten the array of arrays from each keyword request

            // Deduplicate places by place_id
            const uniqueFilteredPlaces = Array.from(
                new Map(allPlaces.map(place => [place.place_id, place])).values()
            );

            // Calculate distances and sort by proximity
            const userLocation = { lat, lng };
            uniqueFilteredPlaces.forEach(place => {
                const placeLocation = { lat: place.geometry.location.lat, lng: place.geometry.location.lng };
                place.distance = parseFloat((haversine(userLocation, placeLocation) * 0.000621371).toFixed(2));
            });

            uniqueFilteredPlaces.sort((a, b) => a.distance - b.distance);

            return uniqueFilteredPlaces;
        } catch (error) {
            console.error("Error fetching nearby places:", error);
            throw error;
        }
    }
);

export const fetchEvents = createAsyncThunk(
    'places/fetchEvents',
    async ({ lat, lng, radius, unit = 'miles' }, thunkAPI) => {
        const ticketMasterApiKey = process.env.EXPO_PUBLIC_TMASTER; // TicketMaster API key
        const googleApiKey = process.env.EXPO_PUBLIC_GOOGLE_KEY; // Google API key
        const ticketMasterUrl = `https://app.ticketmaster.com/discovery/v2/events.json`;
        const timezoneApiUrl = `https://maps.googleapis.com/maps/api/timezone/json`;

        try {
            // Fetch the time zone using Google Time Zone API
            const timezoneResponse = await axios.get(timezoneApiUrl, {
                params: {
                    location: `${lat},${lng}`,
                    timestamp: Math.floor(Date.now() / 1000),
                    key: googleApiKey,
                },
            });

            if (timezoneResponse.data.status !== 'OK') {
                throw new Error('Failed to fetch timezone information');
            }

            const { timeZoneId, rawOffset, dstOffset } = timezoneResponse.data;

            // Calculate the total offset in seconds (standard time + daylight saving time)
            const totalOffset = rawOffset + dstOffset;

            // Get the current date in the user's time zone
            const today = new Date();

            // Convert local start and end times for the current day to UTC
            const localStartTime = new Date(today.setHours(0, 0, 0, 0));
            const localEndTime = new Date(today.setHours(23, 59, 59, 999));

            // Adjust for the user's time zone offset
            const startDateTime = new Date(localStartTime.getTime() - totalOffset * 1000)
                .toISOString()
                .replace(/\.\d+Z$/, 'Z'); // Remove fractional milliseconds
            const endDateTime = new Date(localEndTime.getTime() - totalOffset * 1000)
                .toISOString()
                .replace(/\.\d+Z$/, 'Z'); // Remove fractional milliseconds

            // Fetch events from Ticketmaster API
            const response = await axios.get(ticketMasterUrl, {
                params: {
                    apikey: ticketMasterApiKey,
                    latlong: `${lat},${lng}`,
                    radius,
                    unit,
                    startDateTime,
                    endDateTime,
                    size: 100,
                    page: 0,
                },
            });

            const events = response.data._embedded?.events || [];

            // Filter valid events
            const filteredEvents = events.filter(event =>
                event.name && event.dates?.start?.dateTime && typeof event.url === 'string'
            );

            // Remove duplicates by event name
            const uniqueEvents = [];
            const eventNames = new Set();

            for (const event of filteredEvents) {
                if (!eventNames.has(event.name)) {
                    uniqueEvents.push(event);
                    eventNames.add(event.name);
                }
            }

            // Sort events by distance (closest to furthest)
            const sortedEvents = uniqueEvents.sort((a, b) => {
                const distanceA = a.distance || Infinity;
                const distanceB = b.distance || Infinity;
                return distanceA - distanceB;
            });

            return sortedEvents; // Return sorted events
        } catch (error) {
            console.error('Error fetching events:', error.response?.data || error.message);
            return thunkAPI.rejectWithValue(error.response?.data || 'Unknown error');
        }
    }
);

export const fetchBusinessData = createAsyncThunk(
    'places/fetchBusinessData',
    async (placeIds, thunkAPI) => {
        try {
            const token = await getUserToken();

            const response = await axios.post(
                `${BASE_URL}/activities/check-businesses`, // Replace with your actual API URL
                { placeIds },
                {
                    headers: {
                        Authorization: `Bearer ${token}`, // If authentication is needed
                    },
                }
            );

            return response.data; // Returns an array of businesses found
        } catch (error) {
            console.error('Error fetching business data:', error.response?.data || error.message);
            return thunkAPI.rejectWithValue(error.response?.data || 'Unknown error');
        }
    }
);

export const fetchBusinessRatingSummaries = createAsyncThunk(
    'places/fetchBusinessRatingSummaries',
    async (placeIds, { rejectWithValue }) => {
        try {
            const { data } = await client.query({
                query: GET_BUSINESS_RATING_SUMMARIES,
                variables: { placeIds },
            });

            return data.getBusinessRatingSummaries;
        } catch (error) {
            console.error('❌ Apollo GraphQL error:', error);
            return rejectWithValue(error.message);
        }
    }
);

export const placesSlice = createSlice({
    name: 'places',
    initialState: {
        places: [],
        events: [],
        businessData: [],
        ratingsByPlaceId: {},
        status: 'idle',
        error: null,
        categoryFilter: null,
        isMapView: false,
        viewPreferences: false,
    },
    reducers: {
        resetPlaces: (state) => {
            state.places = [];
        },
        resetEvents: (state) => {
            state.events = [];
        },
        resetBusinessData: (state) => {
            state.businessData = [];
        },
        resetRatingsData: (state) => {
            state.ratingsData = [];
        },
        setCategoryFilter: (state, action) => {
            state.categoryFilter = action.payload;
        },
        clearCategoryFilter: (state) => {
            state.categoryFilter = null;
        },
        toggleMapView: (state) => {
            state.isMapView = !state.isMapView;
        },
        setMapView: (state, action) => {
            state.isMapView = action.payload;
        },
        openPreferences: (state) => {
            state.viewPreferences = true;
        },
        closePreferences: (state) => {
            state.viewPreferences = false;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchNearbyPlaces.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchNearbyPlaces.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.places = action.payload;
            })
            .addCase(fetchNearbyPlaces.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message;
            })
            .addCase(fetchEvents.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchEvents.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.events = action.payload;
            })
            .addCase(fetchEvents.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message;
            })
            .addCase(fetchBusinessData.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchBusinessData.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.businessData = action.payload; // Store businesses in state
            })
            .addCase(fetchBusinessData.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message;
            })
            .addCase(fetchBusinessRatingSummaries.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchBusinessRatingSummaries.fulfilled, (state, action) => {
                state.loading = false;
                action.payload.forEach((summary) => {
                    state.ratingsByPlaceId[summary.placeId] = summary;
                });
            })
            .addCase(fetchBusinessRatingSummaries.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
    }
});

export default placesSlice.reducer;

export const {
    resetPlaces,
    resetEvents,
    resetBusinessData,
    resetRatingsData,
    setCategoryFilter,
    clearCategoryFilter,
    toggleMapView,
    setMapView,
    openPreferences,
    closePreferences,
} = placesSlice.actions;

export const selectPlaces = (state) => state.places.places;
export const selectEvents = (state) => state.places.events;
export const selectBusinessData = (state) => state.places.businessData;
export const selectStatus = (state) => state.places.status;
export const selectRatingsData = (state) => state.places.ratingsByPlaceId || {};
export const selectCategoryFilter = (state) => state.places.categoryFilter;
export const selectIsMapView = (state) => state.places.isMapView;
export const selectViewPreferences = (state) => state.places.viewPreferences;
export const selectRatingByPlaceId = (placeId) => (state) =>
    state.places.ratingsByPlaceId?.[placeId] || null;
