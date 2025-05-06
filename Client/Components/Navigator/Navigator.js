import React from 'react';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { View, Animated, Text } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import Home from '../Home/Home';
import ActivityPage from '../Activities/ActivityPage';
import LoginPage from '../Login/Login';
import BusinessProfile from '../Profile/BusinessProfile';
import UserProfile from '../Profile/UserProfile';
import MyEventsPage from '../BusinessEvents/MyEventsPage';
import Notifications from '../Notifications/Notifications'
import BusinessReviews from '../Reviews/BusinessReviews';
import Insights from '../Insights/Insights';
import Friends from '../Friends/Friends';
import OtherUserProfile from '../Profile/OtherUserProfile';
import { selectIsBusiness, selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from "react-redux";
import { selectUnreadCount } from '../../Slices/NotificationsSlice';
import { markNotificationsSeen} from '../../utils/notificationsHasSeen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabNavigator({ 
    scrollY, 
    onScroll, 
    tabBarTranslateY,
    headerTranslateY, 
    customNavTranslateY,
    customHeaderTranslateY,
    isAtEnd, 
    notificationsSeen,  
    setNotificationsSeen,
    newUnreadCount, 
}) {
    const user = useSelector(selectUser);
    const isBusiness = useSelector(selectIsBusiness);
    const unreadCount = useSelector(selectUnreadCount);
    
    return (
        <Tab.Navigator
            initialRouteName={user ? (isBusiness ? "Reviews" : "Home") : "Activities"}
            tabBar={(props) => (
                <Animated.View
                    style={{
                        transform: [{ translateY: tabBarTranslateY }],
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: Platform.OS === 'ios' ? 90 : 70,
                        backgroundColor: 'white',
                        zIndex: 10,
                        elevation: 10,
                    }}
                >
                    <BottomTabBar {...props} />
                </Animated.View>
            )}
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
                    } else if (route.name === "Notifications") {
                        iconName = 'bell';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === "Insights") {
                        iconName = 'chart-bar';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === "Friends") {
                        iconName = 'account-multiple';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === "Reviews") {
                        iconName = 'clipboard';
                        IconComponent = MaterialCommunityIcons;
                    }

                    return (
                        <View style={{ position: 'relative' }}>
                            <IconComponent name={iconName} size={size} color={color} />
                            {route.name === "Notifications" && notificationsSeen === false && (
                                <View
                                    style={{
                                        position: 'absolute',
                                        top: -4,
                                        right: -10,
                                        backgroundColor: 'red',
                                        borderRadius: 10,
                                        paddingHorizontal: 5,
                                        minWidth: 16,
                                        height: 16,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                                        {newUnreadCount > 9 ? '9+' : newUnreadCount}
                                    </Text>
                                </View>
                            )}
                        </View>
                    );
                },
                tabBarActiveTintColor: 'tomato',
                tabBarInactiveTintColor: 'gray',
                tabBarStyle: { height: Platform.OS === "ios" ? 90 : 70, paddingVertical: 5 },
                tabBarItemStyle: { paddingBottom: Platform.OS === "ios" ? 0 : 6, marginHorizontal: 5, justifyContent: 'center' },
                tabBarLabelStyle: { fontSize: 10, margin: 0, padding: 0 },
                headerShown: false,
            })}
        >

            {/* Conditional Rendering Based on Login Status */}
            {user ? (
                // Logged-in User Screens
                <>
                    {isBusiness ? (
                        // Business-specific Screens
                        <>
                            <Tab.Screen name="Insights" component={Insights} />
                            <Tab.Screen name="My Events">
                            {(props) => (
                                <MyEventsPage
                                    {...props}
                                    scrollY={scrollY}
                                    onScroll={onScroll}
                                    tabBarTranslateY={tabBarTranslateY}
                                    headerTranslateY={headerTranslateY}
                                    customHeaderTranslateY={customHeaderTranslateY}
                                />
                            )}
                            </Tab.Screen>
                            <Tab.Screen name="Reviews">
                                {() => <BusinessReviews scrollY={scrollY} onScroll={onScroll} isAtEnd={isAtEnd} />}
                            </Tab.Screen>
                            <Tab.Screen
                                name="Notifications"
                                component={Notifications}
                                listeners={{
                                    tabPress: async () => {
                                      await markNotificationsSeen(unreadCount);
                                      setNotificationsSeen(true);
                                    }
                                }}                                  
                            />
                            <Tab.Screen name="Profile" component={BusinessProfile} />
                        </>
                    ) : (
                        // User-specific Screens
                        <>
                            <Tab.Screen name="Home">
                                {() => <Home scrollY={scrollY} onScroll={onScroll} isAtEnd={isAtEnd} />}
                            </Tab.Screen>
                            <Tab.Screen name="Activities">
                            {(props) => (
                                <ActivityPage
                                    {...props}
                                    scrollY={scrollY}
                                    onScroll={onScroll}
                                    tabBarTranslateY={tabBarTranslateY}
                                    headerTranslateY={headerTranslateY}
                                    customNavTranslateY={customNavTranslateY}
                                />
                            )}
                            </Tab.Screen>
                            <Tab.Screen
                                name="Notifications"
                                component={Notifications}
                                listeners={{
                                    tabPress: async () => {
                                      await markNotificationsSeen(unreadCount);
                                      setNotificationsSeen(true);
                                    }
                                }}                                  
                            />
                            <Tab.Screen name="Friends" component={Friends} />
                            <Tab.Screen name="Profile" component={UserProfile} />
                        </>
                    )}
                </>
            ) : (
                // Guest Users (Login Screen for Restricted Areas)
                <>
                    <Tab.Screen name="Activities" component={ActivityPage} />
                    <Tab.Screen name="Login" component={LoginPage} />
                </>
            )}
        </Tab.Navigator>
    );
}

function AppNavigator({ scrollY, onScroll, customNavTranslateY, customHeaderTranslateY, headerTranslateY, newUnreadCount, tabBarTranslateY, isAtEnd, notificationsSeen, setNotificationsSeen }) {
    return (
        <Stack.Navigator>
            <Stack.Screen name="TabNavigator" options={{ headerShown: false }}>
                {() =>
                    <TabNavigator
                        scrollY={scrollY}
                        onScroll={onScroll}
                        headerTranslateY={headerTranslateY}
                        tabBarTranslateY={tabBarTranslateY}
                        isAtEnd={isAtEnd}
                        notificationsSeen={notificationsSeen}
                        setNotificationsSeen={setNotificationsSeen}
                        newUnreadCount={newUnreadCount}
                        customNavTranslateY={customNavTranslateY}
                        customHeaderTranslateY={customHeaderTranslateY}
                    />
                }
            </Stack.Screen>

            {/* OtherUserProfile Screen */}
            <Stack.Screen
                name="OtherUserProfile"
                component={OtherUserProfile}
                options={{
                    headerShown: false,
                }}
            />

            <Stack.Screen
                name="BusinessProfile"
                component={BusinessProfile}
                options={{ headerShown: false }}
            />
        </Stack.Navigator>
    )
}

export default AppNavigator;

