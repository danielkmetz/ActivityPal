import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { openSearchModal } from '../../Slices/ModalSlice';
import { navigate } from '../../utils/NavigationService';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { selectConversations, selectMessagesByConversation, selectUserToMessage } from '../../Slices/DirectMessagingSlice';
import SearchModal from '../Home/SearchModal';
import MessageThreadTitle from './MessageThreadTitle';
import { openLocationModal } from '../../Slices/LocationSlice';
import { selectGooglePlaces } from '../../Slices/GooglePlacesSlice';
import { resetPagination } from '../../Slices/PaginationSlice';
import { clearGooglePlaces } from '../../Slices/GooglePlacesSlice';
import { selectIsBusiness } from '../../Slices/UserSlice';
import { selectCategoryFilter, selectIsMapView, toggleMapView, openPreferences } from '../../Slices/PlacesSlice';

export default function Header({ currentRoute, notificationsSeen, setNotificationsSeen, newUnreadCount }) {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const userToMessage = useSelector(selectUserToMessage);
    const activities = useSelector(selectGooglePlaces);
    const isBusiness = useSelector(selectIsBusiness);
    const activitiesRendered = activities.length > 0;
    const conversations = useSelector(selectConversations) || [];
    const categoryFilter = useSelector(selectCategoryFilter);
    const isMapView = useSelector(selectIsMapView);
    const pinIcon = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

    const hasUnreadMessages = conversations.some(
        convo => convo.lastMessage && convo.lastMessage.isRead === false
    );

    const availableCuisines = useMemo(() => {
        const cuisineSet = new Set();
        const excluded = new Set(["unknown"]);

        activities.forEach(activity => {
            if (typeof activity.cuisine === 'string' && !excluded.has(activity.cuisine)) {
                cuisineSet.add(activity.cuisine);
            }
        });

        return Array.from(cuisineSet);
    }, [activities]);

    // Determine dynamic title based on the current route
    const getTitle = () => {
        switch (currentRoute) {
            case "Activities":
                return "Activities";
            case "Home":
                return "Vybe";
            case "Friends":
                return "Friends";
            case "Notifications":
                return "Notifications";
            case "My Events":
                return "My Events";
            case "Reviews":
                return "Reviews";
            case "Insights":
                return "Insights";
            case "CreatePost":
                return "Post";
            case "CreateEvent":
                return "Create Event";
            case "CreatePromotion":
                return "Create Promo";
            case "DirectMessages":
                return "Messages";
            case "SearchFollowing":
                return "New Message";
            case "FilterSort":
                return "Filter/Sort";
            case "Settings":
                return "Settings";
            case "HiddenPosts":
                return "Hidden Posts";
            case "MessageThread":
                return <MessageThreadTitle users={userToMessage || []} />;
            default:
                return "Vybe";
        }
    };

    const route = getTitle();

    const handleOpenSearch = () => {
        dispatch(openSearchModal());
    };

    const handleOpenFollowingModal = () => {
        navigation.navigate("SearchFollowing");
    };

    const handleOpenNotifications = () => {
        navigate("Notifications");
    };

    const handleOpenDMs = () => {
        navigation.navigate("DirectMessages");
    };

    const handleOpenLocationModal = () => {
        dispatch(openLocationModal());
    };

    const goBack = () => {
        navigation.goBack();
    };

    const onOpenPreferences = () => {
        dispatch(openPreferences());
    };

    const onOpenFilter = () => {
        navigation.navigate('FilterSort', { availableCuisines });
    };

    const onToggleMapView = () => {
        dispatch(toggleMapView());
    };

    const onClear = () => {
        dispatch(clearGooglePlaces());
        dispatch(resetPagination());
    };

    return (
        <>
            <View style={[styles.header, activitiesRendered && { paddingTop: 60 }]}>
                {currentRoute === 'Activities' && activitiesRendered ? (
                    <View style={styles.activityHeaderButtons}>
                        <TouchableOpacity style={styles.headerButton} onPress={onOpenPreferences}>
                            <Text style={styles.headerButtonText}>Preferences</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerButton} onPress={onOpenFilter}>
                            <Text style={styles.headerButtonText}>
                                {categoryFilter ? `Filter: ${categoryFilter.replace(/_/g, ' ')}` : 'Filter/Sort'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerButton} onPress={onToggleMapView}>
                            <Text style={styles.headerButtonText}>
                                {isMapView ? 'List View' : 'Map View'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerButton} onPress={onClear}>
                            <Text style={styles.headerButtonText}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.headerContent}>
                        {(
                            currentRoute === "Notifications" ||
                            currentRoute === "CreatePost" ||
                            currentRoute === "CreateEvent" ||
                            currentRoute === "CreatePromotion" ||
                            currentRoute === "DirectMessages" ||
                            currentRoute === "SearchFollowing" ||
                            currentRoute === "MessageThread" ||
                            currentRoute === "FilterSort" ||
                            currentRoute === "EventDetails" ||
                            currentRoute === "Settings" || 
                            currentRoute === "HiddenPosts"
                        ) && (
                                <TouchableOpacity onPress={goBack} style={{ marginLeft: -10 }}>
                                    <MaterialCommunityIcons name="chevron-left" size={35} color="black" />
                                </TouchableOpacity>
                            )}
                        <Text style={styles.title}>{route}</Text>
                        <View style={styles.indicators}>
                            <View style={styles.locationContainer}>
                                {currentRoute !== 'SearchFollowing' &&
                                    currentRoute !== "MessageThread" && (
                                        currentRoute !== 'DirectMessages' ? (
                                            <>
                                                <TouchableOpacity onPress={handleOpenSearch}>
                                                    <FontAwesome name="search" size={20} color="white" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        setNotificationsSeen(true);
                                                        handleOpenNotifications();
                                                    }}
                                                >
                                                    <FontAwesome name="bell" size={20} color="white" />
                                                    {!notificationsSeen && newUnreadCount > 0 && (
                                                        <View style={styles.redDot} />
                                                    )}
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={handleOpenDMs}>
                                                    <MaterialCommunityIcons name="message-text-outline" size={22} color="white" />
                                                    {hasUnreadMessages && <View style={styles.redDot} />}
                                                </TouchableOpacity>
                                                {!isBusiness && (
                                                    <TouchableOpacity onPress={handleOpenLocationModal}>
                                                        <Image
                                                            source={{ uri: pinIcon }}
                                                            style={styles.pinIcon}
                                                        />
                                                    </TouchableOpacity>
                                                )}
                                            </>
                                        ) : (
                                            <TouchableOpacity onPress={handleOpenFollowingModal}>
                                                <FontAwesome name="plus" size={22} color="white" />
                                            </TouchableOpacity>
                                        )
                                    )}
                            </View>
                        </View>
                    </View>
                )}
            </View>
            <SearchModal />
        </>
    );
}

const styles = StyleSheet.create({
    header: {
        backgroundColor: "#008080",
        paddingHorizontal: 20,
        paddingTop: 70,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    title: {
        fontSize: 30,
        color: 'black',
        fontWeight: 'bold',
        fontFamily: "Poppins Bold",
        flex: 1,
    },
    indicators: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    locationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    pinIcon: {
        width: 18,
        height: 18,
    },
    locationText: {
        fontSize: 11,
        color: 'white',
        fontWeight: 'bold',
        marginTop: 5,
    },
    smallIcon: {
        width: 18,
        height: 18,
        marginRight: 5,
    },
    icon: {
        width: 25,
        height: 25,
        marginRight: 5,
    },
    overlay: {
        position: 'absolute',
        top: 110,
        right: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: 8,
        padding: 10,
        zIndex: 999,
    },
    dropdown: {
        borderRadius: 8,
        padding: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 5,
    },
    dropdownItem: {
        fontSize: 16,
        paddingVertical: 6,
        color: 'white',
    },
    userText: {
        fontWeight: 'bold',
        fontSize: 24,
        marginLeft: 5,
    },
    redDot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'red',
        zIndex: 2,
    },
    activityHeaderButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 5,
        paddingBottom: 10,
        paddingTop: 10,
    },
    headerButton: {
        flex: 1,
        backgroundColor: '#006666',
        paddingVertical: 7,
        borderRadius: 6,
        alignItems: 'center',
    },
    headerButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 13,
        textAlign: 'center',
    },
});


