import React, { memo, useMemo } from "react";
import { View, Text, StyleSheet, ImageBackground } from "react-native";
import { getTimeLabel } from "../../utils/formatEventPromoTime";

function SuggestionDetailsHero({
    suggestion,
    height = 160,
}) {
    const details = suggestion?.details || {};
    const title = details?.title || suggestion?.title || "";
    const timeLabel = getTimeLabel(suggestion);
    const distance = suggestion?.distance ?? details?.distance ?? null;
    const distanceLabel = Number.isFinite(distance) ? `${(distance / 1609).toFixed(1)} mi away` : null;

    const heroUrl =
        suggestion?.bannerUrl ||
        details?.bannerUrl ||
        suggestion?.photos?.[0]?.uri ||
        suggestion?.photos?.[0]?.url ||
        suggestion?.media?.[0]?.uri ||
        suggestion?.media?.[0]?.url ||
        null;


    const heroSource = useMemo(() => {
        if (!heroUrl) return null;

        // local require() images are numbers
        if (typeof heroUrl === "number") return heroUrl;

        if (typeof heroUrl === "string") return { uri: heroUrl };

        // already a valid RN image source object
        if (typeof heroUrl === "object") return heroUrl;

        return null;
    }, [heroUrl]);

    const onDark = !!heroSource;

    return (
        <View style={styles.heroWrap}>
            {heroSource ? (
                <ImageBackground
                    source={heroSource}
                    style={[styles.hero, { height }]}
                    resizeMode="cover"
                >
                    <View style={styles.heroOverlay} />
                    <View style={styles.heroContent}>
                        <Text style={styles.heroTitle} numberOfLines={2}>
                            {title || "Details"}
                        </Text>
                        <View style={styles.heroChips}>
                            {!!timeLabel && (
                                <View style={[styles.chip, styles.chipTimeDark]}>
                                    <Text style={[styles.chipTextDark]} numberOfLines={1}>
                                        {timeLabel}
                                    </Text>
                                </View>
                            )}
                            {!!distanceLabel && (
                                <View style={[styles.chip, styles.chipNeutralDark]}>
                                    <Text style={[styles.chipTextDark]} numberOfLines={1}>
                                        {distanceLabel}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                </ImageBackground>
            ) : (
                <View style={[styles.hero, styles.heroNoImage, { height }]}>
                    <Text style={styles.heroTitleLight} numberOfLines={2}>
                        {title || "Details"}
                    </Text>
                    <View style={styles.heroChips}>
                        {!!timeLabel && (
                            <View style={[styles.chip, styles.chipTimeLight]}>
                                <Text style={styles.chipTextLight} numberOfLines={1}>
                                    {timeLabel}
                                </Text>
                            </View>
                        )}
                        {!!distanceLabel && (
                            <View style={[styles.chip, styles.chipNeutralLight]}>
                                <Text style={styles.chipTextLight} numberOfLines={1}>
                                    {distanceLabel}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
}

export default memo(SuggestionDetailsHero);

const styles = StyleSheet.create({
    heroWrap: {
        paddingHorizontal: 12,
        paddingBottom: 6,
    },
    hero: {
        borderRadius: 16,
        overflow: "hidden",
        justifyContent: "flex-end",
    },
    heroNoImage: {
        backgroundColor: "rgba(0,0,0,0.06)",
        padding: 14,
    },
    heroOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.35)",
    },
    heroContent: {
        padding: 14,
    },
    heroTitle: {
        fontSize: 20,
        fontWeight: "900",
        color: "white",
        lineHeight: 26,
    },
    heroTitleLight: {
        fontSize: 20,
        fontWeight: "900",
        color: "#111",
        lineHeight: 26,
    },
    heroChips: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: 10,
    },
    chip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        marginRight: 8,
        marginBottom: 8,
    },
    chipNeutralDark: { backgroundColor: "rgba(255,255,255,0.22)" },
    chipTimeDark: { backgroundColor: "rgba(211,47,47,0.22)" },
    chipTextDark: { fontSize: 12, fontWeight: "800", color: "white" },
    chipNeutralLight: { backgroundColor: "rgba(0,0,0,0.06)" },
    chipTimeLight: { backgroundColor: "rgba(211,47,47,0.14)" },
    chipTextLight: { fontSize: 12, fontWeight: "800", color: "#111" },
});
