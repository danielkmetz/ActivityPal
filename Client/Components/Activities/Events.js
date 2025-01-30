import React from 'react';
import { View, Text, StyleSheet, Image, Linking, TouchableOpacity } from 'react-native';

const Events = ({ event }) => {
    if (!event) return null;

    const {
        name,
        url,
        distance,
        images,
        _embedded: { venues = [] } = {},
    } = event;

    const venue = venues.length > 0 ? venues[0].name : null;

    return (
        <View style={styles.container}>
            {/* Event Image */}
            {images && images.length > 0 && (
                <Image source={{ uri: images[0].url }} style={styles.photo} />
            )}

            {/* Event Name */}
            {name && <Text style={styles.name}>{name}</Text>}

            {/* Venue */}
            {venue && <Text style={styles.vicinity}>Venue: {venue}</Text>}

            {/* Distance */}
            {distance && <Text style={styles.vicinity}>{distance.toFixed(1)} miles away</Text>}

            {/* Event Link */}
            {url && (
                <TouchableOpacity onPress={() => Linking.openURL(url)}>
                    <Text style={styles.link}>View Event Details</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

export default Events;

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'white',
        padding: 10,
        marginVertical: 8,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 3,
    },
    photo: {
        width: '100%',
        height: 200,
        borderRadius: 8,
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
        marginBottom: 4,
    },
    link: {
        fontSize: 14,
        color: '#2196F3',
        marginTop: 4,
        textDecorationLine: 'underline',
    },
});
