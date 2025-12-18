import React, { memo, useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Avatar } from "react-native-paper";

function DetailsModalBody({
    onPressBusiness,
    suggestion,
}) {
    const details = suggestion?.details || {};
    const businessName = suggestion?.businessName || details?.businessName || "";
    const description = details?.description || suggestion?.description || "";
    
    const logoUrl =
        suggestion?.logoUrl ||
        suggestion?.businessLogoUrl ||
        details?.logoUrl ||
        details?.businessLogoUrl ||
        null;

    const address =
        suggestion?.location?.formattedAddress ||
        suggestion?.formattedAddress ||
        details?.address ||
        details?.formattedAddress ||
        "";

    const logoSource = useMemo(() => {
        if (!logoUrl) return profilePicPlaceholder;
        if (typeof logoUrl === "string") return { uri: logoUrl };
        return logoUrl;
    }, [logoUrl]);

    const canPressBusiness = typeof onPressBusiness === "function";

    return (
        <View style={styles.bodyInner}>
            <Text style={styles.sectionLabel}>WHERE</Text>
            <Pressable
                disabled={!canPressBusiness}
                onPress={onPressBusiness}
                style={({ pressed }) => [
                    styles.whereCard,
                    pressed ? styles.whereCardPressed : null,
                ]}
            >
                <Avatar.Image size={44} source={logoSource} style={styles.whereAvatar} />
                <View style={styles.whereText}>
                    <Text style={styles.whereName} numberOfLines={1}>
                        {businessName || "Unknown place"}
                    </Text>
                    {!!address && (
                        <Text style={styles.whereAddress} numberOfLines={1}>
                            {address}
                        </Text>
                    )}
                </View>
                {canPressBusiness ? (
                    <View style={styles.whereArrow}>
                        <Text style={styles.whereArrowText}>›</Text>
                    </View>
                ) : null}
            </Pressable>
            {!!description ? (
                <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>DESCRIPTION</Text>
                    <Text style={styles.description}>{description}</Text>
                </>
            ) : null}
            <View style={{ height: 10 }} />
        </View>
    );
}

export default memo(DetailsModalBody);

const styles = StyleSheet.create({
    bodyInner: {
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 1.2,
        color: "#666",
        marginBottom: 8,
    },
    whereCard: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.08)",
        backgroundColor: "white",
    },
    whereCardPressed: {
        backgroundColor: "rgba(0,0,0,0.02)",
        transform: [{ scale: 0.995 }],
    },
    whereAvatar: { backgroundColor: "#ccc" },
    whereText: { flex: 1, marginLeft: 12 },
    whereName: { fontSize: 14, fontWeight: "900", color: "#111" },
    whereAddress: { fontSize: 12, color: "#777", marginTop: 2 },
    whereArrow: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.06)",
    },
    whereArrowText: { fontSize: 20, fontWeight: "900", color: "#333", marginTop: -1 },
    description: {
        fontSize: 15,
        color: "#444",
        lineHeight: 21,
    },
});
