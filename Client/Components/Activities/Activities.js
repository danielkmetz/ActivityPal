// Activities.js
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

const Activities = ({ activity }) => {
    if (!activity.distance) return null;

    return (
        <View style={styles.container}>
            {/* Display main photo if available */}
            {activity.photoUrl && (
                <Image source={{ uri: activity.photoUrl }} style={styles.photo} />
            )}
            
            {/* Icon (if photoUrl is not available, this can serve as a fallback) */}
            {activity.icon && !activity.photoUrl && (
                <Image source={{ uri: activity.icon }} style={styles.icon} />
            )}
            
            {/* Name */}
            {activity.name && <Text style={styles.name}>{activity.name}</Text>}
            
            {/* Vicinity */}
            {activity.vicinity && <Text style={styles.vicinity}>{activity.vicinity}</Text>}

            {/* Distance */}
            {activity.distance && <Text style={styles.vicinity}>{activity.distance} miles</Text>}
            
        </View>
    );
};

export default Activities;

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
        marginBottom: 4,
    },
    rating: {
        fontSize: 14,
        color: '#333',
    },
    userRatings: {
        fontSize: 12,
        color: '#999',
    },
});
