import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableWithoutFeedback, Animated, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const Activities = ({ activity }) => {
    const navigation = useNavigation();
    const [eventExpanded, setEventExpanded] = useState(false);
    const [promoExpanded, setPromoExpanded] = useState(false);
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

    const isValidDate = (date) => {
        return date && !isNaN(new Date(date).getTime());
    };  
    
    if (!activity.distance) return null;

    return (
        <TouchableWithoutFeedback onPress={handlePress}>
            <View style={styles.container}>
            {/* Display main photo if available */}
            {activity.photoUrl && (
                <Image source={{ uri: activity.photoUrl }} style={styles.photo} />
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

            {/* Special Event Indicator */}
            {activity.events.length > 0 && (
                <TouchableOpacity onPress={() => setEventExpanded(!eventExpanded)} style={styles.eventContainer}>
                    <Animated.View style={[styles.redDot, { opacity: blinkAnim }]} />
                    <Text style={styles.eventText}>Special Event Happening Today!</Text>
                    <Text style={styles.chevron}>{eventExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>
            )}

            {/* Expanded Event Details */}
            {eventExpanded && activity.events.length > 0 && (
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

            {/* Special Promo Indicator */}
            {activity.promotions.length > 0 && (
                <TouchableOpacity onPress={() => setPromoExpanded(!promoExpanded)} style={styles.eventContainer}>
                    <Animated.View style={[styles.redDot, { opacity: blinkAnim }]} />
                    <Text style={styles.eventText}>Special Promotions Today!</Text>
                    <Text style={styles.chevron}>{promoExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>
            )}

            {/* Expanded Promo Details */}
            {promoExpanded && activity.promotions.length > 0 && (
                <View style={styles.eventDetails}>
                    {activity.promotions.map((promotion, index) => (
                        <View key={index} style={styles.eventItem}>
                            <Text style={styles.eventTitle}>{promotion.title}</Text>
                            <Text style={styles.eventDescription}>{promotion.description}</Text>
                        </View>
                    ))}
                </View>
            )}
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
});
