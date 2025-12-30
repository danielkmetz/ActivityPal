import React, { useMemo } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import SearchModal from "../Home/SearchModal";
import SocialHeader from "../Social/SocialHeader";
import { openSearchModal } from "../../Slices/ModalSlice";
import { openLocationModal } from "../../Slices/LocationSlice";
import { selectGooglePlaces, clearGooglePlaces } from "../../Slices/GooglePlacesSlice";
import { resetPagination } from "../../Slices/PaginationSlice";
import { selectIsBusiness } from "../../Slices/UserSlice";
import { getHeaderTitle } from './getTitle';
import { selectConversations, selectUserToMessage } from "../../Slices/DirectMessagingSlice";
import { selectCategoryFilter, selectIsMapView, toggleMapView, openPreferences } from "../../Slices/PlacesSlice";

export default function Header({
    currentRoute,
    notificationsSeen,
    setNotificationsSeen,
    newUnreadCount,
    titleOverride,
}) {
    const dispatch = useDispatch();
    const navigation = useNavigation();

    const userToMessage = useSelector(selectUserToMessage);
    const activities = useSelector(selectGooglePlaces) || [];
    const isBusiness = useSelector(selectIsBusiness);
    const conversations = useSelector(selectConversations) || [];
    const categoryFilter = useSelector(selectCategoryFilter);
    const isMapView = useSelector(selectIsMapView);

    const activitiesRendered = activities.length > 0;
    const isSocial = currentRoute === "Social";
    const pinIcon = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

    const hasUnreadMessages = conversations.some(
        (convo) => convo?.lastMessage && convo.lastMessage.isRead === false
    );

    const availableCuisines = useMemo(() => {
        const cuisineSet = new Set();
        const excluded = new Set(["unknown"]);
        activities.forEach((a) => {
            const c = (a?.cuisine || "").toLowerCase();
            if (c && !excluded.has(c)) cuisineSet.add(c);
        });
        return Array.from(cuisineSet);
    }, [activities]);

    const route = titleOverride || getHeaderTitle(currentRoute, { userToMessage });
    const titleNode =
        typeof route === "string" ? <Text style={styles.title}>{route}</Text> : route;

    const showBack =
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
        currentRoute === "HiddenPosts" ||
        currentRoute === "InviteDetails" ||
        currentRoute === "Social" ||
        currentRoute === "FriendDiscovery" ||
        currentRoute === "MyPlans"; 

    const handleOpenSearch = () => dispatch(openSearchModal());
    const handleOpenFollowingModal = () => navigation.navigate("SearchFollowing");
    const handleOpenNotifications = () => navigation.navigate("Notifications");
    const handleOpenDMs = () => navigation.navigate("DirectMessages");
    const handleOpenLocationModal = () => dispatch(openLocationModal());
    const goBack = () => navigation.goBack();

    const onOpenPreferences = () => dispatch(openPreferences());
    const onOpenFilter = () => navigation.navigate("FilterSort", { availableCuisines });
    const onToggleMapView = () => dispatch(toggleMapView());
    const onClear = () => {
        dispatch(clearGooglePlaces());
        dispatch(resetPagination());
    };

    return (
        <>
            <View
                style={[
                    styles.header,
                    currentRoute === "Activities" && activitiesRendered && { paddingTop: 60 },
                ]}
            >
                {currentRoute === "Activities" && activitiesRendered ? (
                    <View style={styles.activityHeaderButtons}>
                        <TouchableOpacity style={styles.headerButton} onPress={onOpenPreferences}>
                            <Text style={styles.headerButtonText}>Preferences</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerButton} onPress={onOpenFilter}>
                            <Text style={styles.headerButtonText}>
                                {categoryFilter ? `Filter: ${categoryFilter.replace(/_/g, " ")}` : "Filter/Sort"}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerButton} onPress={onToggleMapView}>
                            <Text style={styles.headerButtonText}>{isMapView ? "List View" : "Map View"}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerButton} onPress={onClear}>
                            <Text style={styles.headerButtonText}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <View style={styles.headerContent}>
                            {showBack && (
                                <TouchableOpacity onPress={goBack} style={{ marginLeft: -10 }}>
                                    <MaterialCommunityIcons name="chevron-left" size={35} color="black" />
                                </TouchableOpacity>
                            )}
                            <View style={styles.titleWrap}>{titleNode}</View>
                            <View style={styles.indicators}>
                                <View style={styles.locationContainer}>
                                    {currentRoute !== "SearchFollowing" && currentRoute !== "MessageThread" && (
                                        currentRoute !== "DirectMessages" ? (
                                            <>
                                                {/* Social already has a search input; skip magnifier there (behavior change, not styling) */}
                                                {!isSocial && (
                                                    <TouchableOpacity onPress={handleOpenSearch}>
                                                        <FontAwesome name="search" size={20} color="white" />
                                                    </TouchableOpacity>
                                                )}
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        setNotificationsSeen(true);
                                                        handleOpenNotifications();
                                                    }}
                                                >
                                                    <FontAwesome name="bell" size={20} color="white" />
                                                    {!notificationsSeen && newUnreadCount > 0 && <View style={styles.redDot} />}
                                                </TouchableOpacity>

                                                <TouchableOpacity onPress={handleOpenDMs}>
                                                    <MaterialCommunityIcons name="message-text-outline" size={22} color="white" />
                                                    {hasUnreadMessages && <View style={styles.redDot} />}
                                                </TouchableOpacity>

                                                {!isBusiness && (
                                                    <TouchableOpacity onPress={handleOpenLocationModal}>
                                                        <Image source={{ uri: pinIcon }} style={styles.pinIcon} />
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
                        {isSocial && (
                            <View style={styles.socialExtrasWrap}>
                                <SocialHeader />
                            </View>
                        )}
                    </>
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
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    titleWrap: { flex: 1 },
    title: {
        fontSize: 30,
        color: "black",
        fontWeight: "bold",
        fontFamily: "Poppins Bold",
    },
    indicators: { flexDirection: "row", alignItems: "center" },
    locationContainer: { flexDirection: "row", alignItems: "center", gap: 14 },
    pinIcon: { width: 18, height: 18 },
    redDot: {
        position: "absolute",
        top: -2,
        right: -2,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "red",
        zIndex: 2,
    },
    socialExtrasWrap: {
        backgroundColor: "#f6f7fb",
        marginHorizontal: -20,   // cancel header padding so this can be full-width
        paddingHorizontal: 16,   // SocialHeader layout padding
        paddingBottom: 12,
    },
    activityHeaderButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 5,
        paddingBottom: 10,
        paddingTop: 10,
    },
    headerButton: {
        flex: 1,
        backgroundColor: "#006666",
        paddingVertical: 7,
        borderRadius: 6,
        alignItems: "center",
    },
    headerButtonText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 13,
        textAlign: "center",
    },
});
