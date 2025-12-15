import React, { useRef, useEffect } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { useDispatch } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import PostActions from "./PostActions/PostActions";
import { logEngagementIfNeeded, getEngagementTarget } from "../../Slices/EngagementSlice";
import { medium } from "../../utils/Haptics/haptics";
import SuggestionMedia from './SuggestedItems/SuggestionMedia';
import SuggestionStatusBanner from './SuggestedItems/SuggestionStatusBanner';
import { resolvePostContent } from "../../utils/posts/resolvePostContent";

export default function SuggestionItem({ suggestion, onShare, embeddedInShared = false }) {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const suggestionContent = resolvePostContent(suggestion);
    const tapTimeoutRef = useRef(null);
    const scrollX = useRef(new Animated.Value(0)).current;
    const { placeId } = suggestionContent || {};
    
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
            />
            <PostActions
                post={suggestion}
                handleOpenComments={handleOpenComments}
                onShare={onShare}
                embeddedInShared={embeddedInShared}
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
