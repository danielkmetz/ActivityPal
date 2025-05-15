import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Animated } from 'react-native';
import AppNavigator from './Components/Navigator/Navigator';
import { NavigationContainer, useNavigationState } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import Header from './Components/Header/Header';
import store from './store';
import * as Font from 'expo-font';
import { useDispatch, useSelector } from 'react-redux';
import { 
  getCurrentCoordinates, 
  selectCoordinates, 
  getCityStateCountry, 
} from './Slices/LocationSlice';
import { loadToken } from './Slices/UserSlice';
import { PaperProvider } from 'react-native-paper';
import { selectGooglePlaces } from './Slices/GooglePlacesSlice';
import { fetchNotifications, selectUnreadCount } from './Slices/NotificationsSlice';
import { selectUser } from './Slices/UserSlice';
import useScrollTracking from './utils/useScrollTracking';
import { selectIsBusiness } from './Slices/UserSlice';
import { fetchBusinessNotifications } from './Slices/BusNotificationsSlice';
import { navigationRef } from './utils/NavigationService';

const fetchFonts = async () => {
  return await Font.loadAsync({
    'Poppins': require('./assets/fonts/Poppins-Medium.ttf'),
    'Poppins Bold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
};

function MainApp() {
  const dispatch = useDispatch();
  const activities = useSelector(selectGooglePlaces);
  const coordinates = useSelector(selectCoordinates);
  const isBusiness = useSelector(selectIsBusiness);
  const user = useSelector(selectUser);
  const placeId = user?.businessDetails?.placeId;
  const unreadCount = useSelector(selectUnreadCount);
  const [isAtEnd, setIsAtEnd] = useState(false);
  const [notificationsSeen, setNotificationsSeen] = useState(null);
  const [loadingSeenState, setLoadingSeenState] = useState(true);
  const [notificationsInitialized, setNotificationsInitialized] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(true);
  const [newUnreadCount, setNewUnreadCount] = useState(0);
  const previousUnreadCount = useRef(null);

  const { 
    scrollY, 
    headerTranslateY, 
    tabBarTranslateY, 
    customNavTranslateY, 
    customHeaderTranslateY, 
    handleScroll 
  } = useScrollTracking();
  
  useEffect(() => {
    dispatch(getCurrentCoordinates());
    dispatch(loadToken());
  }, [dispatch]);

  useEffect(() => {
    const initNotifications = async () => {
      try {
        // Step 1: Load AsyncStorage values FIRST
        const seenVal = await AsyncStorage.getItem('@hasSeenNotifications');
        const lastSeenCountVal = await AsyncStorage.getItem('@lastSeenUnreadCount');
  
        const seen = seenVal === 'true';
        const lastSeenCount = parseInt(lastSeenCountVal, 10) || 0;
  
        setNotificationsSeen(seen);
        previousUnreadCount.current = lastSeenCount;
  
        // Step 2: Fetch notifications AFTER that
        if (!isBusiness) {
        await dispatch(fetchNotifications(user.id)); // wait for unreadCount to be updated
        } else {
          await dispatch(fetchBusinessNotifications(placeId));
        }
  
        // Step 3: Now safe to trigger the comparison effect
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
  }, [user, isBusiness, placeId]);  

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
        setNewUnreadCount(0); // no new notifications
      }      
  
      previousUnreadCount.current = unreadCount;
      setShouldFetch(false);
    }
  }, [unreadCount, notificationsInitialized, loadingSeenState, shouldFetch]);
  
  // useEffect(() => {
  //   if (coordinates) {
  //     dispatch(getCityStateCountry(coordinates));
  //   }
  // }, [coordinates, dispatch]);

  // Get current route name using navigation state
  const currentRoute = useNavigationState((state) => {
    if (!state || !state.routes || state.index === undefined) return null;
    
    // Get top-level active screen (likely "TabNavigator")
    const stackRoute = state.routes[state.index];

    // Check if it's a nested navigator (which is the case here)
    if (stackRoute.state?.routes) {
      // Get the active tab screen inside TabNavigator
      const tabRoute = stackRoute.state.routes[stackRoute.state.index];
      return tabRoute.name;
    }

    return stackRoute.name;
  });

  return (
    <View style={styles.container}>
      {/* Conditionally render Header based on the current route */}
      {
        currentRoute !== "Profile" && 
        currentRoute !== "OtherUserProfile" && 
        currentRoute !== "BusinessProfile"&& 
        currentRoute !== "CameraScreen" &&
        currentRoute !== "StoryPreview" &&  
        currentRoute !== "StoryViewer" &&
        !(currentRoute === "Activities" && activities.length > 0) &&
      (
        <Animated.View style={[styles.header, { transform: [{ translateY: headerTranslateY }] }]}>
          <Header currentRoute={currentRoute}/>
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

export default function App() {
  useEffect(() => {
    fetchFonts();
  }, []);

  return (
    <Provider store={store}>
      <PaperProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
        <NavigationContainer ref={(ref) => {
          navigationRef.current = ref;
        }}>
          <MainApp />
        </NavigationContainer>
        </SafeAreaProvider>
        </GestureHandlerRootView>
      </PaperProvider>
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
