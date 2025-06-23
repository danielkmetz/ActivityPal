import React, { useState, useRef } from "react";
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    Animated,
    Dimensions,
    TouchableOpacity,
} from "react-native";
import { Avatar } from "@rneui/themed";
import PhotoItem from "./PhotoItem";
import PhotoPaginationDots from "./PhotoPaginationDots";
import InviteModal from "../ActivityInvites/InviteModal";
import { selectInvites } from "../../Slices/InvitesSlice";
import { useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import SuggestionDetailsModal from "../SuggestionDetails/SuggestionDetailsModal";
import { handleEventOrPromoLike } from "../../utils/LikeHandlers/promoEventLikes";
import PostActions from "./PostActions";

const screenWidth = Dimensions.get("window").width;

export default function SuggestionItem({ suggestion }) {
    const navigation = useNavigation();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [inviteModalVisible, setInviteModalVisible] = useState(false);
    const invites = useSelector(selectInvites);
    const scrollX = useRef(new Animated.Value(0)).current;

    const { businessName, logoUrl, distance, title } = suggestion;
    const photos = suggestion?.photos || [];

    console.log(suggestion);

    const rawInvite = invites.find(invite => {
        if (!invite.placeId || !invite.dateTime) return false;

        const inviteTime = new Date(invite.dateTime).getTime();
        const startTime = new Date(suggestion.startTime).getTime();
        const endTime = suggestion.endTime ? new Date(suggestion.endTime).getTime() : null;

        const isSamePlace = invite.placeId === suggestion.placeId;

        const isActive =
            (suggestion.kind === "activePromo" || suggestion.kind === "activeEvent") &&
            inviteTime >= startTime &&
            endTime && inviteTime <= endTime;

        const isUpcoming =
            (suggestion.kind === "upcomingPromo" || suggestion.kind === "upcomingEvent") &&
            Math.abs(inviteTime - startTime) <= 60 * 60 * 1000;

        return isSamePlace && (isActive || isUpcoming);
    });

    const existingInvite = rawInvite ? { ...rawInvite, type: 'invite' } : null;

    const suggestedPlace = {
        placeId: suggestion.placeId,
        name: suggestion.businessName,
        startTime: suggestion.startTime,
        note: `Lets go to ${businessName} for ${title}`
    };

    const inviteCreationEditing = () => {
        if (existingInvite) {
            navigation.navigate('CreatePost', {
                postType: 'invite',
                isEditing: true,
                initialPost: existingInvite,
            });
        } else {
            setInviteModalVisible(true);
        }
    };

    const handleOpenComments = () => {
        navigation.navigate('EventDetails', { activity: suggestion });
    };

    const handleLikeWithAnimation = () => {
        console.log('post liked');
    };

    return (
        <View style={styles.card}>
            {suggestion.kind && (
                <View style={[
                    styles.statusBanner,
                    suggestion.kind.includes("active") ? styles.activeBanner : styles.upcomingBanner
                ]}>
                    <Text style={styles.statusText}>
                        {suggestion.kind === "activePromo" ? "ACTIVE PROMOTION NEARBY"
                            : suggestion.kind === "upcomingPromo" ? "UPCOMING PROMOTION NEARBY"
                                : suggestion.kind === "activeEvent" ? "ACTIVE EVENT NEARBY"
                                    : suggestion.kind === "upcomingEvent" ? "UPCOMING EVENT NEARBY"
                                        : ""}
                    </Text>
                </View>
            )}
            {photos.length > 0 ? (
                <View style={styles.photoWrapper}>
                    <FlatList
                        data={photos}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(photo, index) => index.toString()}
                        scrollEnabled={photos.length > 1}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                            {
                                useNativeDriver: false,
                                listener: (e) => {
                                    const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                                    setCurrentIndex(index);
                                },
                            }
                        )}
                        scrollEventThrottle={16}
                        renderItem={({ item }) => (
                            <View>
                                <TouchableOpacity activeOpacity={0.85} onPress={() => setDetailsModalVisible(true)}>
                                    <PhotoItem photo={item} isInteractive={false} />
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                    <PhotoPaginationDots photos={photos} scrollX={scrollX} />
                    <View style={styles.overlayTopText}>
                        <Avatar
                            size={45}
                            rounded
                            source={logoUrl ? { uri: logoUrl } : require("../../assets/pics/profile-pic-placeholder.jpg")}
                            containerStyle={styles.overlayAvatar}
                        />
                        <View style={styles.overlayTextContainer}>
                            <Text style={styles.overlayText}>{businessName}</Text>
                            <Text style={styles.overlaySubText}>
                                {distance ? `${(distance / 1609).toFixed(1)} mi away` : null}
                            </Text>
                        </View>
                    </View>
                </View>
            ) : (
                <View>
                    <TouchableOpacity activeOpacity={.85} onPress={() => setDetailsModalVisible(true)}>
                        <PhotoItem photo={suggestion} isInteractive={false} />
                    </TouchableOpacity>
                    <View style={styles.overlayTopText}>
                        <Avatar
                            size={45}
                            rounded
                            source={logoUrl ? { uri: logoUrl } : require("../../assets/pics/profile-pic-placeholder.jpg")}
                            containerStyle={styles.overlayAvatar}
                        />
                        <View style={styles.overlayTextContainer}>
                            <Text style={styles.overlayText}>{businessName}</Text>
                            <Text style={styles.overlaySubText}>
                                {distance ? `${(distance / 1609).toFixed(1)} mi away` : null}
                            </Text>
                        </View>
                    </View>
                </View>
            )}
            <View style={{ flexDirection: 'row', marginBottom: -30, marginTop: -10 }}>
                <PostActions 
                    item={suggestion}
                    handleOpenComments={handleOpenComments}
                    handeLikeWithAnimation={handleLikeWithAnimation}
                />
                <TouchableOpacity
                    style={styles.inviteButton}
                    onPress={inviteCreationEditing}
                >
                    <Text style={styles.inviteText}>
                        {existingInvite ? "Edit Invite" : "Invite"}
                    </Text>
                </TouchableOpacity>
            </View>
            <InviteModal
                visible={inviteModalVisible}
                onClose={() => setInviteModalVisible(false)}
                isEditing={false}
                suggestedPlace={suggestedPlace}
            />
            <SuggestionDetailsModal
                visible={detailsModalVisible}
                onClose={() => setDetailsModalVisible(false)}
                suggestion={suggestion}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: "#fff",
        borderRadius: 6,
        marginBottom: 10,
        elevation: 2,
        paddingBottom: 35,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
        padding: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: "bold",
    },
    sub: {
        fontSize: 14,
        color: "#555",
    },
    distance: {
        fontSize: 12,
        color: "#777",
    },
    description: {
        fontSize: 15,
        marginVertical: 5,
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    footer: {
        fontSize: 12,
        color: "#555",
        marginTop: 10,
    },
    statusTitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 2,
    },
    active: {
        color: "#D32F2F", // red
    },
    upcoming: {
        color: "#1976D2", // blue
    },
    businessName: {
        fontSize: 15,
        fontWeight: "600",
    },
    statusBanner: {
        paddingVertical: 6,
        alignItems: 'center',
        justifyContent: 'center',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
    },
    activeBanner: {
        backgroundColor: '#E53935', // Red
    },
    upcomingBanner: {
        backgroundColor: '#1E88E5', // Blue
    },
    statusText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    timeLabel: {
        fontSize: 14,
        color: '#d32f2f',
        fontWeight: '600',
        textAlign: 'left',
        paddingLeft: 12,
        marginBottom: 6,
    },
    inviteButton: {
        position: 'absolute',
        bottom: 10,
        right: 12,
        backgroundColor: '#1E88E5',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 15,
        elevation: 2,
    },
    inviteText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    photoWrapper: {
        position: 'relative',
    },
    overlayTopText: {
        position: 'absolute',
        bottom: 15,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 8,
        zIndex: 2,
    },
    overlayAvatar: {
        backgroundColor: "#ccc",
        marginRight: 10,
    },
    overlayTextContainer: {
        flexShrink: 1,
    },
    overlayText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    overlaySubText: {
        color: 'white',
        fontSize: 13,
    },
});
