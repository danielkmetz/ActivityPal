import 'react-native-get-random-values';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import AppNavigator from './Components/Navigator/Navigator';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
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
import BusinessProfile from './Components/Profile/BusinessProfile';

const fetchFonts = async () => {
  return await Font.loadAsync({
    'Poppins': require('./assets/fonts/Poppins-Medium.ttf'),
    'Poppins Bold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
};

function MainApp() {
  const dispatch = useDispatch();
  const coordinates = useSelector(selectCoordinates);
  const [currentRoute, setCurrentRoute] = useState(null);
  const navigation = useNavigation();

  useEffect(() => {
    dispatch(getCurrentCoordinates());
    dispatch(loadToken());
  }, [dispatch]);

  useEffect(() => {
    if (coordinates) {
      dispatch(getCityStateCountry(coordinates));
    }
  }, [coordinates, dispatch]);

  useEffect(() => {
    // Add a listener to track the current route name
    const unsubscribe = navigation.addListener('state', () => {
      const route = navigation.getCurrentRoute();
      setCurrentRoute(route.name);
    });

    return unsubscribe;
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Conditionally render Header based on the current route */}
      {currentRoute !== "Profile" && currentRoute !== "OtherUserProfile" && currentRoute !== "BusinessProfile"&& (
        <View style={styles.header}>
          <Header />
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
      <NavigationContainer>
        <MainApp />
      </NavigationContainer>
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
