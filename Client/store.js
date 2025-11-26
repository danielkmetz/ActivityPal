import { configureStore, combineReducers } from "@reduxjs/toolkit";
import locationReducer from './Slices/LocationSlice';
import placesReducer from './Slices/PlacesSlice';
import preferencesReducer from './Slices/PreferencesSlice';
import userReducer from './Slices/UserSlice';
import eventsReducer from './Slices/EventsSlice';
import postsReducer from './Slices/PostsSlice';
import photosReducer from './Slices/PhotosSlice';
import followsReducer from './Slices/friendsSlice';
import notificationsReducer from './Slices/NotificationsSlice';
import favoritesReducer from './Slices/FavoritesSlice';
import promotionsReducer from './Slices/PromotionsSlice';
import GooglePlacesReducer from './Slices/GooglePlacesSlice';
import PaginationReducer from './Slices/PaginationSlice';
import businessNotificationsReducer from './Slices/BusNotificationsSlice';
import commentThreadReducer from './Slices/CommentThreadSlice';
import modalReducer from './Slices/ModalSlice';
import recentSearchesReducer from './Slices/RecentSearchesSlice';
import directMessagesReducer from './Slices/DirectMessagingSlice';
import engagementReducer from './Slices/EngagementSlice';
import insightsReducer from './Slices/InsightsSlice';
import commentsReducer from './Slices/CommentsSlice';
import { commentsListener } from './Listeners/comments';
import { likesListener } from './Listeners/likes';
import { tagRemovalListener } from './Listeners/tagRemoval';
import { crashLoggerMiddleware } from './crashLoggerMiddleware';
import likesReducer from './Slices/LikesSlice';
import removeTagsReducer from './Slices/RemoveTagsSlice';
import taggedPostsReducer from './Slices/TaggedPostsSlice';
import hiddenPostsReducer from './Slices/HiddenPostsSlice';
import BlocksReducer from './Slices/BlocksSlice';
import uiReducer from './Slices/uiSlice';

const store = configureStore({
    reducer: combineReducers({
        location: locationReducer,
        places: placesReducer,
        preferences: preferencesReducer,
        user: userReducer,
        events: eventsReducer,
        posts: postsReducer,
        photos: photosReducer,
        follows: followsReducer,
        notifications: notificationsReducer,
        favorites: favoritesReducer,
        promotions: promotionsReducer,
        GooglePlaces: GooglePlacesReducer,
        pagination: PaginationReducer,
        businessNotifications: businessNotificationsReducer,
        commentThread: commentThreadReducer,
        recentSearches: recentSearchesReducer,
        modals: modalReducer,
        directMessages: directMessagesReducer,
        engagement: engagementReducer,
        insights: insightsReducer,
        comments: commentsReducer,
        likes: likesReducer,
        removeTags: removeTagsReducer,
        taggedPosts: taggedPostsReducer,
        hiddenPosts: hiddenPostsReducer,
        blocks: BlocksReducer,
        ui: uiReducer,
    }),
    middleware: (getDefault) =>
        getDefault({ serializableCheck: false })
            .prepend(crashLoggerMiddleware)   // <— FIRST
            .concat(commentsListener.middleware)
            .concat(likesListener.middleware)
            .concat(tagRemovalListener.middleware),
});

export default store;

