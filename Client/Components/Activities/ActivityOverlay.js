import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const ActivityBannerOverlay = ({ hasEvent, hasPromo, onPress }) => {
    if (!hasEvent && !hasPromo) return null;

    const message = hasEvent && hasPromo
        ? 'Special event & promotion happening today!'
        : hasEvent
        ? 'Special event happening today!'
        : 'Promotion happening today!';

    return (
        <View style={styles.topBanner}>
            <Text style={styles.bannerText}>{message}</Text>
            <TouchableOpacity onPress={onPress} style={styles.viewButton}>
                <Text style={styles.viewButtonText}>View</Text>
            </TouchableOpacity>
        </View>
    );
};

export default ActivityBannerOverlay;

const styles = StyleSheet.create({
    topBanner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
    },
    bannerText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        flex: 1,
        paddingRight: 10,
    },
    viewButton: {
        backgroundColor: 'white',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 4,
    },
    viewButtonText: {
        color: 'black',
        fontWeight: 'bold',
    },
});
