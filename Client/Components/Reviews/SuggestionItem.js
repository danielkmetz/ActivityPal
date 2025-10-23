import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, Animated } from "react-native";
import InviteModal from "../ActivityInvites/InviteModal";
import { useDispatch } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import PostActions from "./PostActions/PostActions";
import { logEngagementIfNeeded, getEngagementTarget } from "../../Slices/EngagementSlice";
import { medium } from "../../utils/Haptics/haptics";
import SuggestionMedia from './SuggestedItems/SuggestionMedia';
import SuggestionStatusBanner from './SuggestedItems/SuggestionStatusBanner';

export default function SuggestionItem({ suggestion, onShare }) {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const currentIndexRef = useRef(0);
    const suggestionContent = suggestion?.original ? suggestion?.original : suggestion;
    const [inviteModalVisible, setInviteModalVisible] = useState(false);
    const tapTimeoutRef = useRef(null);
    const scrollX = useRef(new Animated.Value(0)).current;
    const { photos, placeId } = suggestionContent || {};
    const dotsExist = photos?.length > 1;

    const handleOpenComments = () => {
        const { targetType, targetId } = getEngagementTarget(suggestion);
        medium();

        logEngagementIfNeeded(dispatch, {
            targetType,
            targetId,
            placeId,
            engagementType: 'click',
        });

        navigation.navigate('EventDetails', { activity: suggestionContent });
    };

    useEffect(() => {
        return () => {
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
        };
    }, []);

    return (
        <View style={styles.card}>
            <SuggestionStatusBanner suggestion={suggestion} />
            <SuggestionMedia
                suggestion={suggestion}
                scrollX={scrollX}
                currentIndexRef={currentIndexRef}
            />
            <View style={[{ padding: 15 }, dotsExist ? { marginTop: 5 } : { marginTop: -10 }]}>
                <PostActions
                    post={suggestion}
                    handleOpenComments={handleOpenComments}
                    onShare={onShare}
                />
            </View>
            <InviteModal
                visible={inviteModalVisible}
                onClose={() => setInviteModalVisible(false)}
                isEditing={false}
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
    }
});
