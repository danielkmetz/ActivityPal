import React, { useState, useEffect, useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Image } from 'react-native';
import Preferences from '../Preferences/Preferences';
import { selectEvents, selectPlaces, selectBusinessData, fetchBusinessData } from '../../Slices/PlacesSlice';
import Activities from './Activities';
import Events from './Events';
import { useSelector, useDispatch } from 'react-redux';
import { selectEventType } from '../../Slices/PreferencesSlice';
import homeImage from '../../assets/pics/home_pic.webp';
import heart from '../../assets/pics/heart.png';
import tableware from '../../assets/pics/tableware.webp';
import tickets from '../../assets/pics/tickets.png'; 
import Map from '../Map/Map';

const ActivityPage = () => {
    const dispatch = useDispatch();
    const [modalVisible, setModalVisible] = useState(false);
    const activities = useSelector(selectPlaces);
    const events = useSelector(selectEvents);
    const eventType = useSelector(selectEventType);
    const businessData = useSelector(selectBusinessData);

    const placeIds = activities?.map(activity => activity.place_id);

    useEffect(() => {
        if (placeIds.length > 0 ) {
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
    
    //Places with special events to the top of the list
    const sortedActivities = useMemo(() => {
        return [...mergedActivities].sort((a, b) => {
            const aHasEvent = a.events.length > 0;
            const bHasEvent = b.events.length > 0;
    
            if (aHasEvent && !bHasEvent) return -1; // Place events at the top
            if (!aHasEvent && bHasEvent) return 1;
            return 0; // Keep original order otherwise
        });
    }, [mergedActivities]);

    const handleOpenPreferences = () => {
        setModalVisible(true);
    };

    // Determine data and loading state based on eventType
    const data = eventType !== "Event" ? sortedActivities : events;
    const isLoading = data?.length === 0;

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={handleOpenPreferences} style={styles.imageContainer}>
                <Image 
                    source={homeImage} 
                    style={styles.image} 
                />
                <Text style={styles.imageText}>Find what fits my vibe</Text>
            </TouchableOpacity>
            
            {/* Quick Filter Icons */}
            <View style={styles.filterContainer}>
                <View style={styles.filterItem}>
                    <Text style={styles.filterText}>Date Night</Text>
                    <Image source={heart} style={styles.filterIcon} />
                </View>
                <View style={styles.filterItem}>
                    <Text style={styles.filterText}>Drinks & Dining</Text>
                    <Image source={tableware} style={styles.filterIcon} />
                </View>
                <View style={styles.filterItem}>
                    <Text style={styles.filterText}>Events</Text>
                    <Image source={tickets} style={styles.filterIcon} />
                </View>
            </View>
            
            <Map />
                        
            {/* Preferences Modal */}
            <Preferences
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
            />

            
            {isLoading ? (
                null
            ) : (
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
            )}

            {/* Floating Change Preferences Button */}
            <TouchableOpacity
                onPress={handleOpenPreferences}
                style={styles.floatingButton}
            >
                <Text style={styles.floatingButtonText}>Preferences</Text>
            </TouchableOpacity>
        </View>
    );
};

export default ActivityPage;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f5f5f5',
        //marginTop: 120,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginVertical: 10,
    },
    list: {
        paddingBottom: 20,
    },
    placeholderText: {
        textAlign: 'center',
        fontSize: 16,
        color: '#888',
        marginTop: 20,
    },
    floatingButton: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        backgroundColor: '#2196F3',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
        elevation: 5, // Adds shadow on Android
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2, // Adds shadow on iOS
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
        marginTop: 140,
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
        justifyContent: 'space-around',
        alignItems: 'center',
        marginBottom: 30,
        marginTop: 30,
        paddingHorizontal: 10,
    },
    filterItem: {
        alignItems: 'center',
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
    },
});
