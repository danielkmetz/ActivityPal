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
import favoritesReducer from './Slices/FavoritesSlice';
import promotionsReducer from './Slices/PromotionsSlice';
import GooglePlacesReducer from './Slices/GooglePlacesSlice';
import PaginationReducer from './Slices/PaginationSlice';
import InvitesReducer from './Slices/InvitesSlice';

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
       favorites: favoritesReducer,
       promotions: promotionsReducer,
       GooglePlaces: GooglePlacesReducer,
       pagination: PaginationReducer,
       invites: InvitesReducer,
    })
});

export default store;

