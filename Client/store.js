import { configureStore, combineReducers } from "@reduxjs/toolkit";
import locationReducer from './Slices/LocationSlice';
import placesReducer from './Slices/PlacesSlice';
import preferencesReducer from './Slices/PreferencesSlice';
import userReducer from './Slices/UserSlice';
import eventsReducer from './Slices/EventsSlice';
import reviewsReducer from './Slices/ReviewsSlice';
import photosReducer from './Slices/PhotosSlice';
import followsReducer from './Slices/friendsSlice';
import notificationsReducer from './Slices/NotificationsSlice';
import checkInsReducer from './Slices/CheckInsSlice';
import favoritesReducer from './Slices/FavoritesSlice';
import promotionsReducer from './Slices/PromotionsSlice';
import GooglePlacesReducer from './Slices/GooglePlacesSlice';
import PaginationReducer from './Slices/PaginationSlice';
import InvitesReducer from './Slices/InvitesSlice';
import businessNotificationsReducer from './Slices/BusNotificationsSlice';
import commentThreadReducer from './Slices/CommentThreadSlice';
import modalReducer from './Slices/ModalSlice';
import recentSearchesReducer from './Slices/RecentSearchesSlice';
import storiesReducer from './Slices/StoriesSlice';
import directMessagesReducer from './Slices/DirectMessagingSlice';
import engagementReducer from './Slices/EngagementSlice';
import sharedPostReducer from './Slices/SharedPostsSlice';
import insightsReducer from './Slices/InsightsSlice';
import liveStreamReducer from './Slices/LiveStreamSlice';
import commentsReducer from './Slices/CommentsSlice';
import { commentsListener } from './Listeners/comments';
import { likesListener } from './Listeners/likes';
import { tagRemovalListener } from './Listeners/tagRemoval';
import { crashLoggerMiddleware } from './crashLoggerMiddleware';
import LiveChatReducer from './Slices/LiveChatSlice';
import likesReducer from './Slices/LikesSlice';
import removeTagsReducer from './Slices/RemoveTagsSlice';
import taggedPostsReducer from './Slices/TaggedPostsSlice';

const store = configureStore({
    reducer: combineReducers({
        location: locationReducer,
        places: placesReducer,
        preferences: preferencesReducer,
        user: userReducer,
        events: eventsReducer,
        reviews: reviewsReducer,
        photos: photosReducer,
        follows: followsReducer,
        notifications: notificationsReducer,
        checkIns: checkInsReducer,
        favorites: favoritesReducer,
        promotions: promotionsReducer,
        GooglePlaces: GooglePlacesReducer,
        pagination: PaginationReducer,
        invites: InvitesReducer,
        businessNotifications: businessNotificationsReducer,
        commentThread: commentThreadReducer,
        recentSearches: recentSearchesReducer,
        modals: modalReducer,
        stories: storiesReducer,
        directMessages: directMessagesReducer,
        engagement: engagementReducer,
        sharedPosts: sharedPostReducer,
        insights: insightsReducer,
        live: liveStreamReducer,
        comments: commentsReducer,
        liveChat: LiveChatReducer,
        likes: likesReducer,
        removeTags: removeTagsReducer,
        taggedPosts: taggedPostsReducer
    }),
    middleware: (getDefault) =>
        getDefault({ serializableCheck: false })
            .prepend(crashLoggerMiddleware)   // <— FIRST
            .concat(commentsListener.middleware)
            .concat(likesListener.middleware)
            .concat(tagRemovalListener.middleware),
});

export default store;

