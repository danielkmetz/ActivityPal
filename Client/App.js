import 'react-native-get-random-values';
import React, { useEffect, } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, SafeAreaView } from 'react-native';
import AppNavigator from './Components/Navigator/Navigator';
import { NavigationContainer, useNavigation, useNavigationState } from '@react-navigation/native';
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

function MainApp() {
  const dispatch = useDispatch();
  const activities = useSelector(selectGooglePlaces);
  const coordinates = useSelector(selectCoordinates);
  
  useEffect(() => {
    dispatch(getCurrentCoordinates());
    dispatch(loadToken());
  }, [dispatch]);

  useEffect(() => {
    if (coordinates) {
      dispatch(getCityStateCountry(coordinates));
    }
  }, [coordinates, dispatch]);

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
        <View style={styles.header}>
          <Header currentRoute={currentRoute}/>
        </View>
      )}
      <AppNavigator />
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
