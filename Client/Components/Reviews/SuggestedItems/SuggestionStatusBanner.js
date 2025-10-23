import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function SuggestionStatusBanner({
    suggestion,
    borderRadius = 6,
    activeColor = "#E53935",
    upcomingColor = "#1E88E5",
}) {
    const suggestionContent = suggestion?.original ? suggestion?.original : suggestion;
    const kind = suggestionContent?.kind;
    if (!kind) return null;

    const labelMap = {
        activePromo: "ACTIVE PROMOTION NEARBY",
        upcomingPromo: "UPCOMING PROMOTION NEARBY",
        activeEvent: "ACTIVE EVENT NEARBY",
        upcomingEvent: "UPCOMING EVENT NEARBY",
    };

    const label = labelMap[kind] || "";
    if (!label) return null;

    const isActive = String(kind).includes("active");

    return (
        <View
            style={[
                styles.statusBanner,
                {
                    borderTopLeftRadius: borderRadius,
                    borderTopRightRadius: borderRadius,
                    backgroundColor: isActive ? activeColor : upcomingColor,
                },
            ]}
        >
            <Text style={styles.statusText}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    statusBanner: {
        paddingVertical: 6,
        alignItems: "center",
        justifyContent: "center",
    },
    statusText: {
        color: "white",
        fontSize: 16,
        fontWeight: "bold",
        textTransform: "uppercase",
    },
});
