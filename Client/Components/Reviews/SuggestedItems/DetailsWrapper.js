import React, { useMemo, useCallback, useState } from "react";
import { View, Text, StyleSheet, Dimensions, TouchableWithoutFeedback, Pressable } from "react-native";
import { Avatar } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useDispatch } from "react-redux";
import InviteActionButton from "../Invites/InviteActionButton";
import profilePicPlaceholder from "../../../assets/pics/profile-pic-placeholder.jpg";
import { logEngagementIfNeeded } from "../../../Slices/EngagementSlice";
import { getTimeLabel } from "../../../utils/formatEventPromoTime";
import { resolvePostContent } from "../../../utils/posts/resolvePostContent";
import SuggestionDetailsModal from '../../SuggestionDetails/SuggestionDetailsModal';

const screenWidth = Dimensions.get("window").width;

export default function DetailsWrapper({ suggestion, existingInvite, children }) {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const content = useMemo(() => resolvePostContent(suggestion), [suggestion]);
    const [ detailsOpen, setDetailsOpen ] = useState(false);
    const { businessName, distance, placeId, details, logoUrl, businessLogoUrl } = content || {};
    const title = details?.title || content?.title || "";
    const resolvedLogoUrl = logoUrl || businessLogoUrl;
    const sharedPost = suggestion?.type === "sharedPost" || !!suggestion?.original;
    const overlayTextSize = sharedPost ? 14 : 16;
    const timeLabel = getTimeLabel(content, { compact: true });
    const distanceLabel = Number.isFinite(distance) ? `${(distance / 1609).toFixed(1)} mi away` : null;

    const onPressBusiness = () => {
        logEngagementIfNeeded(dispatch, {
            targetType: "place",
            targetId: placeId,
            placeId,
            engagementType: "click",
        });
        navigation.navigate("BusinessProfile", { business: content });
    };

    const openDetails = useCallback(() => setDetailsOpen(true), []);
    const closeDetails = useCallback(() => setDetailsOpen(false), []);

    return (
        <View style={styles.container}>
            {/* Top */}
            <View style={styles.topBar}>
                <TouchableWithoutFeedback onPress={onPressBusiness}>
                    <View style={styles.overlayBusiness}>
                        <Avatar.Image
                            size={25}
                            source={resolvedLogoUrl ? { uri: resolvedLogoUrl } : profilePicPlaceholder}
                            style={styles.overlayAvatar}
                        />
                        <View style={styles.overlayTextContainer}>
                            <Text style={[styles.overlayText, { fontSize: overlayTextSize }]} numberOfLines={1}>
                                {businessName}
                            </Text>
                            {!!distanceLabel && <Text style={styles.overlaySubText}>{distanceLabel}</Text>}
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </View>
            {/* Media */}
            <View style={styles.mediaWrapper}>{children}</View>
            {/* Bottom */}
            <View style={styles.bottomBar}>
                <View style={styles.bottomTextContainer}>
                    <Text style={styles.eventPromoTitle} numberOfLines={1} ellipsizeMode="tail">
                        {title}
                    </Text>
                    {!!timeLabel && (
                        <Text style={styles.eventPromoTime} numberOfLines={1} ellipsizeMode="tail">
                            {timeLabel}
                        </Text>
                    )}
                    <Pressable
                        onPress={openDetails}
                        hitSlop={10}
                        style={({ pressed }) => [
                            styles.detailsRow,
                            pressed && styles.detailsRowPressed,
                        ]}
                    >
                        <Text style={styles.detailsLink}>Details</Text>
                        <Ionicons name="chevron-forward" size={14} color="white" style={styles.detailsIcon} />
                    </Pressable>
                </View>
                <InviteActionButton suggestion={suggestion} existingInvite={existingInvite} />
            </View>
            <SuggestionDetailsModal
                visible={detailsOpen}
                onClose={closeDetails}
                suggestion={suggestion}
                onPressBusiness={onPressBusiness} 
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { width: screenWidth, alignSelf: "center" },
    topBar: {
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: 8,
    },
    mediaWrapper: {
        alignSelf: "center",
    },
    bottomBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "rgba(0,0,0,0.65)",
        padding: 8,
    },
    bottomTextContainer: { flex: 1, flexShrink: 1, marginRight: 8 },
    overlayBusiness: { flexDirection: "row", alignItems: "center" },
    overlayAvatar: { backgroundColor: "#ccc", marginRight: 10 },
    overlayTextContainer: { flexShrink: 1, marginLeft: 5 },
    eventPromoTitle: { color: "white", fontSize: 17, flexShrink: 1 },
    eventPromoDescription: { color: "white", fontSize: 15, flexShrink: 1 },
    overlayText: { color: "white", fontWeight: "bold" },
    overlaySubText: { color: "white", fontSize: 13 },
    eventPromoTime: { fontSize: 14, color: "#d32f2f", fontWeight: "600", },
    detailsRow: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start", // prevents taking full width
        marginTop: 6,
    },
    detailsRowPressed: {
        opacity: 0.6,
    },
    detailsLink: {
        fontSize: 12,
        color: "white",
        fontWeight: "700",
        textDecorationLine: "underline",
        textDecorationColor: "rgba(255,255,255,0.9)",
    },
    detailsIcon: {
        marginLeft: 4,
        opacity: 0.9,
    },
});
