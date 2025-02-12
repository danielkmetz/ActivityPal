import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated, } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const Activities = ({ activity }) => {
    const navigation = useNavigation();
    const [expanded, setExpanded] = useState(false);
    const blinkAnim = new Animated.Value(1);
    
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(blinkAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
                Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true })
            ])
        ).start();       
    }, []);

    const handlePress = () => {
        if (activity.business) {
            navigation.navigate("BusinessProfile", { business: activity.business });
        }
    };
    
    if (!activity.distance) return null;

    return (
        <TouchableOpacity onPress={handlePress} style={styles.container}>
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

            {/* Special Event Indicator */}
            {activity.events.length > 0 && (
                <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.eventContainer}>
                    <Animated.View style={[styles.redDot, { opacity: blinkAnim }]} />
                    <Text style={styles.eventText}>🔥 Special Event Happening Today!</Text>
                    <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>
            )}

            {/* Expanded Event Details */}
            {expanded && activity.events.length > 0 && (
                <View style={styles.eventDetails}>
                    {activity.events.map((event, index) => (
                        <View key={index} style={styles.eventItem}>
                            <Text style={styles.eventTitle}>{event.title}</Text>
                            <Text style={styles.eventDescription}>{event.description}</Text>
                            <Text style={styles.eventDate}>📅 {new Date(event.date).toLocaleString()}</Text>
                        </View>
                    ))}
                </View>
            )}
        </TouchableOpacity>
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
    eventContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: '#FFEBEE',
        borderRadius: 6,
        marginTop: 10,
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
        color: '#D32F2F',
        flex: 1,
    },
    chevron: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#D32F2F',
    },
    eventDetails: {
        backgroundColor: '#FFEBEE',
        padding: 10,
        borderRadius: 6,
        marginTop: 5,
    },
    eventItem: {
        marginBottom: 10,
    },
    eventTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#B71C1C',
    },
    eventDescription: {
        fontSize: 14,
        color: '#5D4037',
    },
    eventDate: {
        fontSize: 12,
        color: '#757575',
        marginTop: 4,
    },
});
