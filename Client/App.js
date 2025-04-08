import 'react-native-get-random-values';
import React, { useEffect, useRef, useState } from 'react';
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
  const [isAtEnd, setIsAtEnd] = useState(false);
  
  // Track scrolling and header visibility
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const lastScrollTime = useRef(Date.now());
  const isHeaderVisible = useRef(true);

  const tabBarTranslateY = headerTranslateY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0],
    outputRange: [TAB_BAR_HEIGHT, 0], // tab bar moves down as header moves up
    extrapolate: 'clamp',
  });
  
  // Scroll listener function
  const handleScroll = (event) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const currentTime = Date.now();
    const deltaY = currentY - lastScrollY.current;
    const deltaTime = currentTime - lastScrollTime.current;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
  
    const velocity = deltaY / (deltaTime || 1);
  
    lastScrollY.current = currentY;
    lastScrollTime.current = currentTime;
  
    const isNearTop = currentY <= 0;
    const isReallyAtTop = currentY <= 35;
  
    // ⛔ Prevent bounce-triggered hide at top
    if (velocity > MIN_VELOCITY_TO_TRIGGER && isHeaderVisible.current && !isNearTop) {
      Animated.timing(headerTranslateY, {
        toValue: -HEADER_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
      isHeaderVisible.current = false;
    }
  
    // ✅ Allow header to reappear on intentional fast scroll up
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
    } else if (isReallyAtTop && !isHeaderVisible.current) {
      Animated.timing(headerTranslateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
      isHeaderVisible.current = true;
    }

    const isAtBottom = currentY + layoutHeight >= contentHeight - 100; // threshold of 100px
    setIsAtEnd(isAtBottom);
  };
  
  useEffect(() => {
    dispatch(getCurrentCoordinates());
    dispatch(loadToken());
  }, [dispatch]);

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
        isAtEnd={isAtEnd}
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
