import React, { useState, useRef, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Dimensions,
    TouchableOpacity,
} from "react-native";
import { Avatar } from "@rneui/themed";
import PhotoItem from "./Photos/PhotoItem";
import InviteModal from "../ActivityInvites/InviteModal";
import { selectInvites } from "../../Slices/InvitesSlice";
import { useDispatch, useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import SuggestionDetailsModal from "../SuggestionDetails/SuggestionDetailsModal";
import { eventPromoLikeWithAnimation } from "../../utils/LikeHandlers/promoEventLikes";
import PostActions from "./PostActions";
import { selectUser } from "../../Slices/UserSlice";
import { logEngagementIfNeeded, getEngagementTarget } from "../../Slices/EngagementSlice";
import profilePicPlaceholder from "../../assets/pics/profile-pic-placeholder.jpg";
import PhotoFeed from "./Photos/PhotoFeed";

const screenWidth = Dimensions.get("window").width;

export default function SuggestionItem({ suggestion, onShare, sharedPost }) {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const currentIndexRef = useRef(0);
    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [inviteModalVisible, setInviteModalVisible] = useState(false);
    const [likedAnimations, setLikedAnimations] = useState({});
    const lastTapRef = useRef({});
    const invites = useSelector(selectInvites);
    const tapTimeoutRef = useRef(null);
    const scrollX = useRef(new Animated.Value(0)).current;
    const placeId = suggestion?.placeId;
    const { businessName, logoUrl, businessLogoUrl, distance, title, media, photos } = suggestion || {};
    const resolvedLogoUrl = logoUrl || businessLogoUrl;
    const resolvedMedia = photos || media || [];
    const overlayTextSize = sharedPost ? 14 : 16;
    const dotsExist = photos?.length > 1;

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
        const { targetType, targetId } = getEngagementTarget(suggestion);

        logEngagementIfNeeded(dispatch, {
            targetType,
            targetId,
            placeId,
            engagementType: 'click',
        });

        navigation.navigate('EventDetails', { activity: suggestion });
    };

    const handleLikeWithAnimation = (item, force = true) => {
        eventPromoLikeWithAnimation({
            type: item.kind.includes('Promo') ? 'promo' : 'event',
            postId: item._id,
            item,
            user,
            lastTapRef,
            likedAnimations,
            setLikedAnimations,
            dispatch,
            force,
        });
    };

    const handlePhotoTap = (item) => {
        const now = Date.now();
        const lastTap = lastTapRef.current[item._id] || 0;
        const DOUBLE_TAP_DELAY = 100;

        if (now - lastTap < DOUBLE_TAP_DELAY) {
            clearTimeout(tapTimeoutRef.current);
            lastTapRef.current[item._id] = 0;
            handleLikeWithAnimation(item); // Double tap => like
        } else {
            lastTapRef.current[item._id] = now;

            if (tapTimeoutRef.current) {
                clearTimeout(tapTimeoutRef.current);
            }

            tapTimeoutRef.current = setTimeout(() => {
                setDetailsModalVisible(true); // Single tap => open modal

                const { targetType, targetId } = getEngagementTarget(suggestion);
                logEngagementIfNeeded(dispatch, {
                    targetType,
                    targetId,
                    placeId,
                    engagementType: 'click',
                });
            }, DOUBLE_TAP_DELAY);
        }
    };

    useEffect(() => {
        return () => {
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
        };
    }, []);

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
            {resolvedMedia?.length > 0 ? (
                <View style={styles.photoWrapper}>
                    <PhotoFeed
                        media={resolvedMedia}
                        scrollX={scrollX}
                        currentIndexRef={currentIndexRef}
                        onOpenFullScreen={handlePhotoTap}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        lastTapRef={lastTapRef}
                        reviewItem={suggestion}
                    />
                    <View style={styles.overlayTopText}>
                        <Avatar
                            size={45}
                            rounded
                            source={resolvedLogoUrl ? { uri: resolvedLogoUrl } : profilePicPlaceholder}
                            containerStyle={styles.overlayAvatar}
                        />
                        <View style={styles.overlayTextContainer}>
                            <Text style={[styles.overlayText, { fontSize: overlayTextSize }]}>{businessName}</Text>
                            <Text style={styles.overlaySubText}>
                                {distance ? `${(distance / 1609).toFixed(1)} mi away` : null}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.inviteButton}
                            onPress={inviteCreationEditing}
                        >
                            <Text style={styles.inviteText}>
                                {existingInvite ? "Edit Invite" : "Invite"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <View>
                    <TouchableOpacity activeOpacity={.85} onPress={() => handlePhotoTap(suggestion)}>
                        <PhotoItem photo={suggestion} isInteractive={false} />
                    </TouchableOpacity>
                    <View style={styles.overlayTopText}>
                        <Avatar
                            size={45}
                            rounded
                            source={resolvedLogoUrl ? { uri: resolvedLogoUrl } : profilePicPlaceholder}
                            containerStyle={styles.overlayAvatar}
                        />
                        <View style={styles.overlayTextContainer}>
                            <Text style={[styles.overlayText, { fontSize: sharedPost ? 14 : 16 }]}>{businessName}</Text>
                            <Text style={styles.overlaySubText}>
                                {distance ? `${(distance / 1609).toFixed(1)} mi away` : null}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.inviteButton}
                            onPress={inviteCreationEditing}
                        >
                            <Text style={styles.inviteText}>
                                {existingInvite ? "Edit Invite" : "Invite"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
            {!sharedPost && (
                <View style={[{ padding: 15 }, dotsExist ? { marginTop: 5 } : { marginTop: -10 }]}>
                    <PostActions
                        item={suggestion}
                        handleOpenComments={handleOpenComments}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        inviteCreationEditing={inviteCreationEditing}
                        existingInvite={existingInvite}
                        onShare={onShare}
                    />
                </View>
            )}
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
        right: 10,
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
        alignSelf: 'center',
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
        width: screenWidth,
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
        fontWeight: 'bold',
    },
    overlaySubText: {
        color: 'white',
        fontSize: 13,
    },
});
