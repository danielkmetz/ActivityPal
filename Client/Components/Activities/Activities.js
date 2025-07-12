import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableWithoutFeedback,
    TouchableOpacity,
    Animated,
    Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { fetchEventById } from '../../Slices/EventsSlice';
import { fetchPromotionById } from '../../Slices/PromotionsSlice';
import { useDispatch } from 'react-redux';
import { logEngagementIfNeeded, getEngagementTarget } from '../../Slices/EngagementSlice';

const Activities = ({ activity }) => {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const [showEvents, setShowEvents] = useState(false);
    const [showPromotions, setShowPromotions] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;
    
    const handlePress = () => {
        if (activity.business) {
            navigation.navigate('BusinessProfile', { business: activity.business });
        }
    };

    const handleEventPromoPress = (item, type) => {
        const placeId = item.placeId;

        if (type === "event") {
            dispatch(fetchEventById(item._id));
        } else {
            dispatch(fetchPromotionById(item._id));
        }
        const { targetType, targetId } = getEngagementTarget(item);
        logEngagementIfNeeded(dispatch, {
            targetType,
            targetId,
            placeId,
            engagementType: 'click',
        });
        navigation.navigate('EventDetails', { activity: item });
    };

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 1.4,
                    duration: 500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1,
                    duration: 500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );

        pulse.start();

        return () => pulse.stop();
    }, []);

    if (!activity.distance) return null;

    return (
        <TouchableWithoutFeedback onPress={handlePress}>
            <View style={styles.container}>
                {/* Photo */}
                {activity.photoUrl && (
                    <View style={styles.imageWrapper}>
                        <Image source={{ uri: activity.photoUrl }} style={styles.photo} />

                        {activity.opening_hours?.open_now === false && (
                            <View style={styles.closedOverlay}>
                                <Text style={styles.closedText}>Closed</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Icon fallback */}
                {activity.icon && !activity.photoUrl && (
                    <Image source={{ uri: activity.icon }} style={styles.icon} />
                )}

                {/* Basic Info */}
                <View style={styles.infoContainer}>
                    {activity.name && <Text style={styles.name}>{activity.name}</Text>}
                    {activity.address && <Text style={styles.vicinity}>{activity.address}</Text>}
                    {activity.distance && (
                        <Text style={styles.vicinity}>{Number(activity.distance).toFixed(3)} miles</Text>
                    )}
                </View>

                {/* EVENTS DROPDOWN */}
                {activity.events.length > 0 && (
                    <View style={styles.dropdownContainer}>
                        <TouchableOpacity onPress={() => setShowEvents(!showEvents)} style={styles.dropdownHeader}>
                            <View style={styles.titleAndStar}>
                                <View style={styles.starRow}>
                                    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                                        <Text style={styles.star}>⭐</Text>
                                    </Animated.View>
                                    <Text style={styles.dropdownTitle}>Events Today!</Text>
                                </View>
                            </View>
                            <Text style={styles.dropIcon}>{showEvents ? '▲' : '▼'}</Text>
                        </TouchableOpacity>

                        {showEvents && (
                            <View style={styles.dropdownContent}>
                                {activity.events.map((event, idx) => (
                                    <View key={idx} style={styles.dropdownItem}>
                                        <Text style={styles.itemText}>{event.title}</Text>
                                        <TouchableOpacity onPress={() => handleEventPromoPress(event, "event")}>
                                            <Text style={styles.detailsButton}>Details</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {/* PROMOTIONS DROPDOWN */}
                {activity.promotions.length > 0 && (
                    <View style={styles.dropdownContainer}>
                        <TouchableOpacity onPress={() => setShowPromotions(!showPromotions)} style={styles.dropdownHeader}>
                            <View style={styles.titleAndStar}>
                                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                                    <Text style={styles.star}>⭐</Text>
                                </Animated.View>
                                <Text style={styles.dropdownTitle}>Promotions Today!</Text>
                            </View>
                            <Text style={styles.dropIcon}>{showPromotions ? '▲' : '▼'}</Text>
                        </TouchableOpacity>

                        {showPromotions && (
                            <View style={styles.dropdownContent}>
                                {activity.promotions.map((promo, idx) => (
                                    <View key={idx} style={styles.dropdownItem}>
                                        <Text style={styles.itemText}>{promo.title}</Text>
                                        <TouchableOpacity onPress={() => handleEventPromoPress(promo, "promo")}>
                                            <Text style={styles.detailsButton}>Details</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
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
    dropdownContainer: {
        paddingHorizontal: 10,
        paddingBottom: 10,
    },
    dropdownHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderTopWidth: 1,
        borderColor: '#ccc',
    },
    dropdownTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    dropIcon: {
        marginRight: 10,
    },
    dropdownContent: {
        paddingVertical: 6,
    },
    dropdownItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    itemText: {
        fontSize: 14,
        color: '#333',
        flex: 1,
        marginRight: 10,
    },
    detailsButton: {
        fontSize: 14,
        color: '#007AFF',
        fontWeight: '600',
    },
    titleAndStar: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    starRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    star: {
        fontSize: 18,
        marginRight: 10,
    },
});
