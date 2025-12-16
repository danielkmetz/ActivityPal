import React from 'react';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { View, Animated, Image } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';
import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
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
import CameraScreen from '../CameraScreen/CameraScreen';
import { selectIsBusiness, selectUser } from '../../Slices/UserSlice';
import { useSelector } from "react-redux";
import CommentScreen from '../Reviews/CommentScreen';
import CreatePost from '../Reviews/CreatePost/CreatePost';
import FullScreenPhoto from '../Reviews/Photos/FullScreenPhoto';
import DirectMessagesScreen from '../DirectMessages/DirectMessagesScreen';
import MessageThreadScreen from '../DirectMessages/MessageThreadScreen';
import SearchFollowingScreen from '../SearchFollowingUsers/SearchFollowingScreen';
import FilterSortScreen from '../Activities/FilterSortScreen';
import EventDetailsScreen from '../Activities/EventPromoDetails/EventDetailsScreen';
import { selectProfilePic } from '../../Slices/PhotosSlice';
import SettingsScreen from '../Profile/Settings/SettingsScreen';
import HiddenPostsScreen from '../Profile/Settings/HiddenPostsScreen';
import MyPlansScreen from '../../screens/MyPlansScreen';
import InviteDetailsScreen from '../../screens/InviteDetailsScreen';
import CreateEventOrPromoPage from '../BusinessEvents/CreateEventPromo/CreateEventOrPromoPage';
import CameraPreview from '../../screens/CameraPreview';

enableScreens(true);
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();

function HomeStackNavigator({ scrollY, onScroll, isAtEnd }) {
    return (
        <HomeStack.Navigator screenOptions={{ headerShown: false, detachPreviousScreen: true, }}>
            <HomeStack.Screen name="HomeMain">
                {() => <Home scrollY={scrollY} onScroll={onScroll} isAtEnd={isAtEnd} />}
            </HomeStack.Screen>
            <HomeStack.Screen name="OtherUserProfile" component={OtherUserProfile} />
        </HomeStack.Navigator>
    );
};

function TabNavigator({
    scrollY,
    onScroll,
    tabBarTranslateY,
    headerTranslateY,
    customNavTranslateY,
    customHeaderTranslateY,
    isAtEnd,
}) {
    const user = useSelector(selectUser);
    const isBusiness = useSelector(selectIsBusiness);
    const profilePic = useSelector(selectProfilePic);
    const profilePicUrl = profilePic?.url;

    return (
        <Tab.Navigator
            initialRouteName={user ? (isBusiness ? "Reviews" : "Home") : "Activities"}
            tabBar={(props) => (
                <Animated.View
                    pointerEvents='box-none'
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
                    let iconSize = size;

                    if (route.name === 'Home') {
                        iconName = 'home';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === 'Activities') {
                        iconName = 'bunk-bed';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === 'Profile') {
                        if (profilePic) {
                            return (
                                <Image
                                    source={{ uri: profilePicUrl }}
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 14,
                                        borderWidth: 1,
                                        borderColor: color === 'tomato' ? 'tomato' : 'gray',
                                    }}
                                />
                            );
                        } else {
                            iconName = 'account-circle';
                            IconComponent = MaterialCommunityIcons;
                        }
                    } else if (route.name === "Login") {
                        iconName = 'login';
                        IconComponent = MaterialCommunityIcons;
                    } else if (route.name === "My Events") {
                        iconName = 'calendar-multiselect';
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
                    } else if (route.name === "Post") {
                        iconName = 'plus-circle';
                        IconComponent = MaterialCommunityIcons;
                        iconSize = 56;
                    }

                    return (
                        <View style={{ position: 'relative' }}>
                            <IconComponent name={iconName} size={iconSize} color={color} />
                        </View>
                    );
                },
                tabBarActiveTintColor: 'tomato',
                tabBarInactiveTintColor: 'gray',
                tabBarStyle: { height: Platform.OS === "ios" ? 90 : 70, paddingVertical: 5 },
                tabBarItemStyle: { paddingBottom: Platform.OS === "ios" ? 0 : 6, marginHorizontal: 5, justifyContent: 'center' },
                tabBarLabelStyle: { fontSize: 11, margin: 0, padding: 0 },
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
                            <Tab.Screen name="Profile" component={BusinessProfile} />
                        </>
                    ) : (
                        // User-specific Screens
                        <>
                            <Tab.Screen name="Home">
                                {() => <HomeStackNavigator scrollY={scrollY} onScroll={onScroll} isAtEnd={isAtEnd} />}
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
                                name="Post"
                                options={{
                                    tabBarLabel: () => null, // 👈 hide label
                                }}
                                listeners={({ navigation }) => ({
                                    tabPress: (e) => {
                                        e.preventDefault();
                                        navigation.navigate("CreatePost", { postType: "review" });
                                    },
                                })}
                            >
                                {() => null}
                            </Tab.Screen>
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
};

function AppNavigator({ scrollY, onScroll, customNavTranslateY, customHeaderTranslateY, headerTranslateY, newUnreadCount, tabBarTranslateY, isAtEnd, notificationsSeen, setNotificationsSeen }) {
    return (
        <Stack.Navigator
            screenOptions={{
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                detachPreviousScreen: true,
            }}>
            <Stack.Screen name="TabNavigator">
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
            <Stack.Screen name="BusinessProfile" component={BusinessProfile} />
            <Stack.Screen name="CameraScreen" component={CameraScreen} />
            <Stack.Screen name="Notifications" component={Notifications} />
            <Stack.Screen name="CreatePost" component={CreatePost} />
            <Stack.Screen name="CreateEventOrPromo" component={CreateEventOrPromoPage} />
            <Stack.Screen name="CommentScreen" component={CommentScreen} />
            <Stack.Screen name="FullScreenPhoto" component={FullScreenPhoto} />
            <Stack.Screen name="DirectMessages" component={DirectMessagesScreen} />
            <Stack.Screen name="MessageThread" component={MessageThreadScreen} />
            <Stack.Screen name="SearchFollowing" component={SearchFollowingScreen} />
            <Stack.Screen name="FilterSort" component={FilterSortScreen} />
            <Stack.Screen name="EventDetails" component={EventDetailsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="HiddenPosts" component={HiddenPostsScreen} scrollY={scrollY} onScroll={onScroll} isAtEnd={isAtEnd} />
            <Stack.Screen name="MyPlans" component={MyPlansScreen} options={{ title: 'Plans'}} />
            <Stack.Screen name="InviteDetails" component={InviteDetailsScreen} options={{ title: 'Plan details'}} />
            <Stack.Screen name="CameraPreview" component={CameraPreview} />
        </Stack.Navigator>
    )
}

export default AppNavigator;

