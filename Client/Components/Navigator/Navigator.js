import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import Home from '../Home/Home';
import ActivityPage from '../Activities/ActivityPage';
import LoginPage from '../Login/Login';
import BusinessProfile from '../Profile/BusinessProfile';
import UserProfile from '../Profile/UserProfile';
import MyEventsPage from '../BusinessEvents/MyEventsPage';
import ReviewsTab from '../Reviews/ReviewsTab';
import BusinessReviews from '../Reviews/BusinessReviews';
import Insights from '../Insights/Insights';
import Friends from '../Friends/Friends';
import OtherUserProfile from '../Profile/OtherUserProfile';
import {selectIsBusiness, selectUser} from '../../Slices/UserSlice';
import { useSelector } from "react-redux";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabNavigator() {
    const user = useSelector(selectUser);
    const isBusiness = useSelector(selectIsBusiness);

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    let iconName;
                    let IconComponent = FontAwesome;

                    if (route.name === 'Home') {
                        iconName = 'home';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === 'Activities') {
                        iconName = 'bunk-bed';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === 'Profile') {
                        iconName = 'account-circle';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === "Login") {
                        iconName = 'login';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === "My Events") {
                        iconName = 'calendar-multiselect';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === "Reviews") {
                        iconName = 'clipboard-edit';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === "Insights") {
                        iconName = 'chart-bar';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === "Friends") {
                        iconName = 'account-multiple';
                        IconComponent = MaterialCommunityIcons;
                    } 

                    return <IconComponent name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: 'tomato',
                tabBarInactiveTintColor: 'gray',
                tabBarStyle: { height: Platform.OS === "ios" ? 90 : 70, paddingVertical: 5 },
                tabBarItemStyle: { paddingBottom: Platform.OS === "ios" ? 0 : 6, marginHorizontal: 5, justifyContent: 'center' },
                tabBarLabelStyle: { fontSize: 10, margin: 0, padding: 0 },
                headerShown: false,
            })}
        >
            
            {/* Conditional Rendering for Activities */}
            {!isBusiness && <Tab.Screen name="Home" component={Home} />}
            {!isBusiness && <Tab.Screen name="Activities" component={ActivityPage} />}

            {/* Conditional Rendering Based on Login Status */}
            {user ? (
            // Logged-in User Screens
            <>
                {isBusiness ? (
                // Business-specific Screens
                <>
                    <Tab.Screen name="Insights" component={Insights} />
                    <Tab.Screen name="My Events" component={MyEventsPage} />
                    <Tab.Screen name="Reviews" component={BusinessReviews} />
                    <Tab.Screen name="Profile" component={BusinessProfile} />
                </>
                ) : (
                // User-specific Screens
                <>
                    <Tab.Screen name="Reviews" component={ReviewsTab} />
                    <Tab.Screen name="Friends"component={Friends} />
                    <Tab.Screen name="Profile" component={UserProfile} />
                </>
                )}
            </>
            ) : (
            // Guest Users (Login Screen for Restricted Areas)
            <Tab.Screen name="Login" component={LoginPage} />
            )}
        </Tab.Navigator>
    );
}

function AppNavigator() {
    return (
        <Stack.Navigator>
            <Stack.Screen name="TabNavigator" options={{headerShown: false}}>
                {() => <TabNavigator />}
            </Stack.Screen>

            {/* OtherUserProfile Screen */}
            <Stack.Screen
                name="OtherUserProfile"
                component={OtherUserProfile}
                options={{
                    headerShown: false,
                }}
            />
        </Stack.Navigator>
    )
}

export default AppNavigator;

