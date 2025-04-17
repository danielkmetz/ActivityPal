import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Animated, Platform } from 'react-native';
import AppNavigator from './Components/Navigator/Navigator';
import { NavigationContainer, useNavigationState } from '@react-navigation/native';
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

const fetchFonts = async () => {
  return await Font.loadAsync({
    'Poppins': require('./assets/fonts/Poppins-Medium.ttf'),
    'Poppins Bold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
};

const HEADER_HEIGHT = 130;
const MIN_VELOCITY_TO_TRIGGER = .8;
const MIN_SCROLL_DELTA = 20; //
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 90 : 70;

function MainApp() {
  const dispatch = useDispatch();
  const activities = useSelector(selectGooglePlaces);
  const coordinates = useSelector(selectCoordinates);
  const user = useSelector(selectUser);
  const unreadCount = useSelector(selectUnreadCount);
  const [isAtEnd, setIsAtEnd] = useState(false);
  const [notificationsSeen, setNotificationsSeen] = useState(null);
  const [loadingSeenState, setLoadingSeenState] = useState(true);
  const [notificationsInitialized, setNotificationsInitialized] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(true);
  const [newUnreadCount, setNewUnreadCount] = useState(0);
  const previousUnreadCount = useRef(null);
  
  // Track scrolling and header visibility
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  //const customNavTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const lastScrollTime = useRef(Date.now());
  const isHeaderVisible = useRef(true);

  const tabBarTranslateY = headerTranslateY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0],
    outputRange: [TAB_BAR_HEIGHT, 0],
    extrapolate: 'clamp',
  });
  
  const customNavTranslateY = headerTranslateY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0],
    outputRange: [150, 0],
    extrapolate: 'clamp',
  });
  
  console.log(customNavTranslateY);
  
  // Scroll listener function
  const handleScroll = (event) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    const currentTime = Date.now();
    const deltaY = currentY - lastScrollY.current;
    const deltaTime = currentTime - lastScrollTime.current;
  
    const velocity = deltaY / (deltaTime || 1);
  
    lastScrollY.current = currentY;
    lastScrollTime.current = currentTime;
  
    const isNearTop = currentY <= 0;
    const isReallyAtTop = currentY <= 35;
  
    // ✅ Scroll DOWN → HIDE
    if (
      velocity > MIN_VELOCITY_TO_TRIGGER &&
      !isNearTop &&
      isHeaderVisible.current
    ) {
      Animated.timing(headerTranslateY, {
        toValue: -HEADER_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
      isHeaderVisible.current = false;
    }
  
    // ✅ Scroll UP → SHOW
    else if (
      velocity < -MIN_VELOCITY_TO_TRIGGER &&
      Math.abs(deltaY) > MIN_SCROLL_DELTA &&
      !isHeaderVisible.current
    ) {
      Animated.timing(headerTranslateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
      isHeaderVisible.current = true;
    }
  
    // ✅ Snap-to-top → SHOW
    else if (isReallyAtTop && !isHeaderVisible.current) {
      Animated.timing(headerTranslateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
      isHeaderVisible.current = true;
    }
  
    const isAtBottom = currentY + layoutHeight >= contentHeight - 100;
    setIsAtEnd(isAtBottom);
  };
  
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
        await dispatch(fetchNotifications(user.id)); // wait for unreadCount to be updated
  
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
  }, [user]);  

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
        !(currentRoute === "Activities" && activities.length > 0) &&
      (
        <Animated.View style={[styles.header, { transform: [{ translateY: headerTranslateY }] }]}>
          <Header currentRoute={currentRoute}/>
        </Animated.View>
      )}
      <AppNavigator 
        scrollY={scrollY} 
        onScroll={handleScroll} 
        tabBarTranslateY={tabBarTranslateY} 
        headerTranslateY={headerTranslateY}
        customNavTranslateY={customNavTranslateY}
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
        <NavigationContainer>
          <MainApp />
        </NavigationContainer>
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
