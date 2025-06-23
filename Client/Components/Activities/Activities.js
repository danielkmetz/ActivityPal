import React from 'react';
import { View, Text, StyleSheet, Image, TouchableWithoutFeedback, } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ActivityBannerOverlay from './ActivityOverlay';

const Activities = ({ activity }) => {
    const navigation = useNavigation();

    const handlePress = () => {
        if (activity.business) {
            navigation.navigate("BusinessProfile", { business: activity.business });
        }
    };

    const handleEventPromoPress = () => {
        navigation.navigate('EventDetails', { activity });
    }

    if (!activity.distance) return null

    return (
        <TouchableWithoutFeedback onPress={handlePress}>
            <View style={styles.container}>
                {/* Display main photo if available */}
                {activity.photoUrl && (
                    <View style={styles.imageWrapper}>
                        {/* ⬅️ Overlay at the top of the image */}
                        <ActivityBannerOverlay
                            hasEvent={activity.events.length > 0}
                            hasPromo={activity.promotions.length > 0}
                            onPress={() => handleEventPromoPress()}
                        />

                        <Image source={{ uri: activity.photoUrl }} style={styles.photo} />

                        {activity.opening_hours?.open_now === false && (
                            <View style={styles.closedOverlay}>
                                <Text style={styles.closedText}>Closed</Text>
                            </View>
                        )}
                    </View>
                )}
                {/* Icon (if photoUrl is not available, this can serve as a fallback) */}
                {activity.icon && !activity.photoUrl && (
                    <Image source={{ uri: activity.icon }} style={styles.icon} />
                )}

                <View style={styles.infoContainer}>
                    {/* Name */}
                    {activity.name && <Text style={styles.name}>{activity.name}</Text>}

                    {/* Vicinity */}
                    {activity.address && <Text style={styles.vicinity}>{activity.address}</Text>}

                    {/* Distance */}
                    {activity.distance && <Text style={styles.vicinity}>{Number(activity.distance).toFixed(3)} miles</Text>}
                </View>
            </View>
        </TouchableWithoutFeedback>
    );
};

export default Activities;

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'white',
        marginVertical: 8,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    photo: {
        width: '100%',
        height: 200,
        marginBottom: 8,
    },
    infoContainer: {
        padding: 10,
    },
    icon: {
        width: 50,
        height: 50,
        marginBottom: 8,
    },
    name: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    vicinity: {
        fontSize: 14,
        color: '#666',
    },
    eventContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        paddingHorizontal: 10,
        backgroundColor: '#33cccc',

    },
    redDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'red',
        marginRight: 8,
    },
    eventText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: 'black',
        flex: 1,
    },
    chevron: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'black',
    },
    eventDetails: {
        backgroundColor: '#99e6e6',
        padding: 10,
    },
    eventItem: {
        marginBottom: 10,
    },
    eventTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'black',
    },
    eventDescription: {
        fontSize: 14,
        color: '#5D4037',
        marginTop: 10,
    },
    eventDate: {
        fontSize: 12,
        color: '#757575',
        marginTop: 4,
    },
    imageWrapper: {
        position: 'relative',
    },
    closedOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 7,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closedText: {
        color: 'white',
        fontSize: 32,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 20,
        paddingVertical: 5,
        borderRadius: 5,
        transform: [{ rotate: '-20deg' }],
    },
});
