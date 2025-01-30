import { createSlice } from "@reduxjs/toolkit";

export const preferencesSlice = createSlice({
    name: 'preferences',
    initialState: {
        distance: 5,
        budget: "$",
        eventType: null,
        familyFriendly: false,
    },
    reducers: {
        setDistance: (state, action) => {
            state.distance = action.payload;
        },
        setBudget: (state, action) => {
            state.budget = action.payload;
        },
        setIsFamilyFriendly: (state, action) => {
            state.familyFriendly = action.payload;
        },
        setEventType: (state, action) => {
            state.eventType = action.payload;
        },
        resetDistance: (state, action) => {
            state.distance = null;
        },
        resetBudget: (state, action) => {
            state.budget = null;
        },
        resetFamilyFriendly: (state, action) => {
            state.familyFriendly = false;
        },
        resetEventType: (state, action) => {
            state.eventType = null;
        }
    }
});

export default preferencesSlice.reducer;

export const selectDistance = (state) => state.preferences.distance;
export const selectBudget = (state) => state.preferences.budget;
export const selectFamilyFriendly = (state) => state.preferences.familyFriendly;
export const selectEventType = (state) => state.preferences.eventType;

export const {
    setDistance, 
    setBudget, 
    setIsFamilyFriendly,
    setEventType,
    resetEventType, 
    resetBudget, 
    resetDistance, 
    resetFamilyFriendly} = preferencesSlice.actions