import React, { useState, useEffect, useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Image, ActivityIndicator, } from 'react-native';
import PreferencesModal from '../Preferences/Preferences';
import { selectEvents, selectPlaces, selectBusinessData, fetchBusinessData, selectStatus, fetchEvents, fetchNearbyPlaces} from '../../Slices/PlacesSlice';
import Activities from './Activities';
import Events from './Events';
import { useSelector, useDispatch } from 'react-redux';
import { selectEventType } from '../../Slices/PreferencesSlice';
import { selectCoordinates } from '../../Slices/LocationSlice';
import { milesToMeters } from '../../functions';
import heart from '../../assets/pics/heart2.png';
import tableware from '../../assets/pics/tableware.webp';
import tickets from '../../assets/pics/tickets2.png'; 
import hiking from '../../assets/pics/hiking.png';
import popcorn from '../../assets/pics/popcorn.png';
import budgetFriendly from '../../assets/pics/budget-friendly.png';
import arcade from '../../assets/pics/arcade.png';
import art from '../../assets/pics/art.png';
import family from '../../assets/pics/family.png';
import dog from '../../assets/pics/dog.png';
import microphone from '../../assets/pics/microphone.png';
import map from '../../assets/pics/map.png';
import Map from '../Map/Map';

const ActivityPage = () => {
    const dispatch = useDispatch();
    const status = useSelector(selectStatus);
    const activities = useSelector(selectPlaces);
    const events = useSelector(selectEvents);
    const eventType = useSelector(selectEventType);
    const businessData = useSelector(selectBusinessData);
    const coordinates = useSelector(selectCoordinates);
    const [ prefModalVisible, setPrefModalVisible ] = useState(false);

    const placeIds = activities?.map(activity => activity.place_id);
    const lat = coordinates?.lat;
    const lng = coordinates?.lng;
    const manualDistance = milesToMeters(10);
    const closeDistance = milesToMeters(3);
    const eventDistance = 50;
    const manualBudget = "$$$$";
    const lowBudget = "$"

    useEffect(() => {
        if (placeIds.length > 0) {
            dispatch(fetchBusinessData(placeIds));
        }
    }, [dispatch, JSON.stringify(placeIds)]);

    // Merge business events into activities only when businessData is available
    const mergedActivities = useMemo(() => {
        return activities.map(activity => {
            const business = businessData.find(biz => biz.placeId === activity.place_id);
            return business
                ? { ...activity, events: business.events || [], business }
                : { ...activity, events: [] };
        });
    }, [activities, businessData]);

    // Places with special events appear at the top
    const sortedActivities = useMemo(() => {
        return [...mergedActivities].sort((a, b) => {
            const aHasEvent = a.events.length > 0;
            const bHasEvent = b.events.length > 0;
            return aHasEvent && !bHasEvent ? -1 : !aHasEvent && bHasEvent ? 1 : 0;
        });
    }, [mergedActivities]);

    // Determine data and loading state based on eventType
    const data = eventType !== "Event" ? sortedActivities : events;

    const handleOpenPreferences = () => setPrefModalVisible(true);

    const handleActivityFetch = (type) => {
        if (type === "events") {
            dispatch(fetchEvents({ lat, lng, radius: eventDistance}));
        } else if (type === "budgetFriendly") {
            dispatch(fetchNearbyPlaces({ 
                lat, 
                lng, 
                radius: manualDistance, 
                budget: lowBudget, 
                activityType: type
            }))
        } else if (type === 'whatsClose') {
            dispatch(fetchNearbyPlaces({
                lat,
                lng,
                radius: closeDistance,
                budget: manualBudget,
                activityType: type,
            }))
        } else {
            dispatch(fetchNearbyPlaces({
                lat,
                lng,
                radius: manualDistance,
                budget: manualBudget,
                activityType: type,
            }))
        }
    }

    return (
        <>
        <View style={styles.container}>
            {status === "loading" ? (
                // Show loading indicator while fetching data
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2196F3" />
                </View>
            ) : (
                <>
                {events.length > 0 || activities.length > 0 ? (
                    <FlatList
                    data={data}
                    keyExtractor={(item) => item.id || item.reference || String(Math.random())}
                    renderItem={({ item }) =>
                        eventType !== "Event" ? (
                            <Activities activity={item} />
                        ) : (
                            <Events event={item} />
                        )
                    }
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    />
                ) : (
                <>
                    <Text style={styles.filterTitle}>Quick Filters</Text>
                    {/* Quick Filter Icons */}
                    <View style={styles.filterContainer}>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('dateNight')}
                        >
                            <Text style={styles.filterText}>Date Night</Text>
                            <Image source={heart} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('dateAndDining')}
                        >
                            <Text style={styles.filterText}>Drinks & Dining</Text>
                            <Image source={tableware} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('events')}
                        >
                            <Text style={styles.filterText}>Events</Text>
                            <Image source={tickets} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('outdoor')}
                        >
                            <Text style={styles.filterText}>Outdoor</Text>
                            <Image source={hiking} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('movieNight')}
                        >
                            <Text style={styles.filterText}>Movie Night</Text>
                            <Image source={popcorn} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('budgetFriendly')}
                        >
                            <Text style={styles.filterText}>Budget Friendly</Text>
                            <Image source={budgetFriendly} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('gaming')}
                        >
                            <Text style={styles.filterText}>Gaming</Text>
                            <Image source={arcade} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('artAndCulture')}
                        >
                            <Text style={styles.filterText}>Art & Culture</Text>
                            <Image source={art} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('familyFun')}
                        >
                            <Text style={styles.filterText}>Family Fun</Text>
                            <Image source={family} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('petFriendly')}
                        >
                            <Text style={styles.filterText}>Pet Friendly</Text>
                            <Image source={dog} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('liveMusic')}
                        >
                            <Text style={styles.filterText}>Live Music</Text>
                            <Image source={microphone} style={styles.filterIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={styles.filterItem}
                            onPress={() => handleActivityFetch('whatsClose')}
                        >
                            <Text style={styles.filterText}>What's Close</Text>
                            <Image source={map} style={styles.filterIcon} />
                        </TouchableOpacity>
                    </View>            
                </>     
                )}
                </>
            )}
            <TouchableOpacity
                onPress={handleOpenPreferences}
                style={styles.floatingButton}
            >
                <Text style={styles.floatingButtonText}>Preferences</Text>
            </TouchableOpacity>
        </View>
        <PreferencesModal 
            visible={prefModalVisible}
            onClose={() => setPrefModalVisible(false)}
        />
        </>
    );
};

export default ActivityPage;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f5f5f5',
        marginTop: 125,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        paddingBottom: 20,
    },
    floatingButton: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        backgroundColor: '#2196F3',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    },
    floatingButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    imageContainer: {
        width: '100%',
        height: 200,
        marginBottom: 20,
        borderRadius: 10,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    imageText: {
        position: 'absolute',
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: 5,
    },
    filterContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        alignItems: 'center',
        marginBottom: 30,
        marginTop: 30,
        paddingHorizontal: 10,
    },
    filterItem: {
        alignItems: 'center',
        width: '30%',
        marginBottom: 15,
    },
    filterIcon: {
        width: 50,
        height: 50,
        marginBottom: 5,
    },
    filterText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: 'black',
        marginBottom: 7,
        textAlign: 'center',
    },
    filterTitle: {
        fontSize: 20,
        marginLeft: 30,
        fontFamily: 'Poppins Bold',
        marginTop : 30,
    },
});
