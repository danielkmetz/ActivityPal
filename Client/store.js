import { configureStore, combineReducers } from "@reduxjs/toolkit";
import locationReducer from './Slices/LocationSlice';
import placesReducer from './Slices/PlacesSlice';
import preferencesReducer from './Slices/PreferencesSlice';
import userReducer from './Slices/UserSlice';
import eventsReducer from './Slices/EventsSlice';
import reviewsReducer from './Slices/ReviewsSlice';
import photosReducer from './Slices/PhotosSlice';
import friendsReducer from './Slices/friendsSlice';
import notificationsReducer from './Slices/NotificationsSlice';
import checkInsReducer from './Slices/CheckInsSlice';

const store = configureStore({
    reducer: combineReducers({
       location: locationReducer,
       places: placesReducer, 
       preferences: preferencesReducer,
       user: userReducer,
       events: eventsReducer,
       reviews: reviewsReducer,
       photos: photosReducer,
       friends: friendsReducer,
       notifications: notificationsReducer,
       checkIns: checkInsReducer,
    })
});

export default store;

