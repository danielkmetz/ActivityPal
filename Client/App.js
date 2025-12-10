import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApolloProvider } from '@apollo/client';
import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Animated, Text } from 'react-native';
import AppNavigator from './Components/Navigator/Navigator';
import { NavigationContainer, useNavigationState } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useDispatch, useSelector } from 'react-redux';
import Header from './Components/Header/Header';
import store from './store';
import * as Font from 'expo-font';
import { getCurrentCoordinates, selectCoordinates, getCityStateCountry } from './Slices/LocationSlice';
import { loadToken, selectUser, selectIsBusiness } from './Slices/UserSlice';
import { PaperProvider } from 'react-native-paper';
import { selectGooglePlaces, fetchNearbyPromosAndEvents } from './Slices/GooglePlacesSlice';
import { fetchNotifications, selectUnreadCount } from './Slices/NotificationsSlice';
import { fetchBusinessNotifications } from './Slices/BusNotificationsSlice';
import useScrollTracking from './utils/useScrollTracking';
import { navigationRef } from './utils/NavigationService';
import { fetchSuggestedFriends, setHasFetchedSuggestions, selectHasFetchedSuggestions } from './Slices/friendsSlice';
import { fetchProfilePic } from './Slices/PhotosSlice';
import client from './apolloClient';
import { LikeAnimationsProvider } from './utils/LikeHandlers/LikeAnimationContext';
import { BusinessReviewsProvider } from './Providers/BusinessReviewsContext';
import { UserFeedProvider } from './Providers/UserFeedContext';
import { HiddenTaggedProvider } from './Providers/HiddenTaggedContext';
import { HiddenPostsProvider } from './Providers/HiddenPostsContext';
import { selectHeaderTitle } from './Slices/uiSlice';
import InvitesProvider from './Providers/InvitesProvider';

const fetchFonts = async () => {
  return await Font.loadAsync({
    Poppins: require('./assets/fonts/Poppins-Medium.ttf'),
    'Poppins Bold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
};

/* ----------------------- NAV STATE HELPER ---------------------- */

function getActiveRouteName(state) {
  try {
    if (!state || !state.routes || typeof state.index !== 'number') return null;
    let route = state.routes[state.index];

    // drill down into nested navigators
    while (route.state && route.state.routes && typeof route.state.index === 'number') {
      route = route.state.routes[route.state.index];
    }

    return route.name;
  } catch (e) {
    return null;
  }
}

/* ----------------------------- MAIN APP TREE ----------------------------- */

function MainApp() {
  const dispatch = useDispatch();
  const activities = useSelector(selectGooglePlaces);
  const coordinates = useSelector(selectCoordinates);
  const isBusiness = useSelector(selectIsBusiness);
  const user = useSelector(selectUser);
  const hasFetchSuggested = useSelector(selectHasFetchedSuggestions);
  const placeId = user?.businessDetails?.placeId;
  const unreadCount = useSelector(selectUnreadCount);
  const headerTitle = useSelector(selectHeaderTitle);

  const [isAtEnd, setIsAtEnd] = useState(false);
  const [notificationsSeen, setNotificationsSeen] = useState(null);
  const [loadingSeenState, setLoadingSeenState] = useState(true);
  const [notificationsInitialized, setNotificationsInitialized] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(true);
  const [newUnreadCount, setNewUnreadCount] = useState(0);
  const previousUnreadCount = useRef(null);

  const userId = user?.id;
  const lat = coordinates?.lat;
  const lng = coordinates?.lng;

  const {
    scrollY,
    headerTranslateY,
    tabBarTranslateY,
    customNavTranslateY,
    customHeaderTranslateY,
    resetHeaderAndTab,
    handleScroll,
  } = useScrollTracking();

  useEffect(() => {
    dispatch(getCurrentCoordinates());
    dispatch(loadToken());
  }, [dispatch]);

  useEffect(() => {
    if (userId) {
      dispatch(fetchProfilePic(userId));
    }
  }, [userId, dispatch]);

  // fetch suggested follows
  useEffect(() => {
    if (userId && !hasFetchSuggested) {
      dispatch(fetchSuggestedFriends(userId));
      dispatch(setHasFetchedSuggestions(true));
    }
  }, [userId, hasFetchSuggested, dispatch]);

  // notifications init
  useEffect(() => {
    const initNotifications = async () => {
      try {
        const seenVal = await AsyncStorage.getItem('@hasSeenNotifications');
        const lastSeenCountVal = await AsyncStorage.getItem('@lastSeenUnreadCount');

        const seen = seenVal === 'true';
        const lastSeenCount = parseInt(lastSeenCountVal, 10) || 0;

        setNotificationsSeen(seen);
        previousUnreadCount.current = lastSeenCount;

        if (!isBusiness) {
          await dispatch(fetchNotifications(user.id));
        } else {
          await dispatch(fetchBusinessNotifications(placeId));
        }

        setNotificationsInitialized(true);
      } catch (e) {
        setNotificationsSeen(true);
        previousUnreadCount.current = 0;
        setNotificationsInitialized(true);
      }

      setLoadingSeenState(false);
    };

    if (user?.id) {
      initNotifications();
    }
  }, [user, isBusiness, placeId, dispatch]);

  // Compare unread counts once initialized
  useEffect(() => {
    if (
      notificationsInitialized &&
      !loadingSeenState &&
      shouldFetch &&
      previousUnreadCount.current !== null
    ) {
      if (unreadCount > previousUnreadCount.current) {
        const diff = unreadCount - previousUnreadCount.current;
        setNewUnreadCount(diff);
        setNotificationsSeen(false);
      } else {
        setNewUnreadCount(0);
      }

      previousUnreadCount.current = unreadCount;
      setShouldFetch(false);
    }
  }, [unreadCount, notificationsInitialized, loadingSeenState, shouldFetch]);

  // Get current route name using navigation state
  const currentRoute = useNavigationState((state) => {
    const name = getActiveRouteName(state);
    return name;
  });

  // fetch nearby promos and events
  useEffect(() => {
    if (lat && lng && !isBusiness && userId) {
      dispatch(fetchNearbyPromosAndEvents({ lat, lng, userId }));
    }
  }, [lat, lng, userId, isBusiness, dispatch]);

  // header and tab bar management during navigation
  useEffect(() => {
    const excludedRoutes = [
      'Profile',
      'OtherUserProfile',
      'BusinessProfile',
      'CameraScreen',
      'CommentScreen',
      'FullScreenPhoto',
    ];

    const shouldResetHeader =
      !excludedRoutes.includes(currentRoute) &&
      !(currentRoute === 'Activities' && activities.length > 0);

    if (shouldResetHeader) {
      resetHeaderAndTab();
    }
  }, [currentRoute, activities, resetHeaderAndTab]);

  return (
    <View style={styles.container}>
      {/* Conditionally render Header based on the current route */}
      {currentRoute !== 'Profile' &&
        currentRoute !== 'OtherUserProfile' &&
        currentRoute !== 'OtherUserProfile' &&
        currentRoute !== 'BusinessProfile' &&
        currentRoute !== 'CameraScreen' &&
        currentRoute !== 'CommentScreen' &&
        currentRoute !== 'FullScreenPhoto' &&
        currentRoute !== 'EventDetails' && (
          <Animated.View
            style={[styles.header, { transform: [{ translateY: headerTranslateY }] }]}
          >
            <Header
              titleOverride={headerTitle}
              currentRoute={currentRoute}
              notificationsSeen={notificationsSeen}
              setNotificationsSeen={setNotificationsSeen}
              newUnreadCount={newUnreadCount}
            />
          </Animated.View>
        )}

      <AppNavigator
        scrollY={scrollY}
        onScroll={(e) => handleScroll(e, setIsAtEnd)}
        tabBarTranslateY={tabBarTranslateY}
        headerTranslateY={headerTranslateY}
        customNavTranslateY={customNavTranslateY}
        customHeaderTranslateY={customHeaderTranslateY}
        isAtEnd={isAtEnd}
        notificationsSeen={notificationsSeen}
        setNotificationsSeen={setNotificationsSeen}
        newUnreadCount={newUnreadCount}
      />
      <StatusBar style="auto" />
    </View>
  );
}

/* ------------------------------ ERROR BOUNDARY ------------------------------ */

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Optionally report error to an external service
  }

  render() {
    if (this.state.error) {
      return (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: 'white', padding: 16, textAlign: 'center' }}>
            Something went wrong. Check console logs for details.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

/* --------------------------------- APP --------------------------------- */

export default function App() {
  useEffect(() => {
    fetchFonts().catch(() => {
      // Silently ignore font load errors here
    });
  }, []);

  return (
    <Provider store={store}>
      <ApolloProvider client={client}>
        <PaperProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
              <InvitesProvider>
                <LikeAnimationsProvider>
                  <BusinessReviewsProvider>
                    <HiddenPostsProvider>
                      <HiddenTaggedProvider>
                        <UserFeedProvider>
                          <NavigationContainer
                            ref={(ref) => {
                              navigationRef.current = ref;
                            }}
                          >
                            <RootErrorBoundary>
                              <MainApp />
                            </RootErrorBoundary>
                          </NavigationContainer>
                        </UserFeedProvider>
                      </HiddenTaggedProvider>
                    </HiddenPostsProvider>
                  </BusinessReviewsProvider>
                </LikeAnimationsProvider>
              </InvitesProvider>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </PaperProvider>
      </ApolloProvider>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    height: 130,
  },
});
