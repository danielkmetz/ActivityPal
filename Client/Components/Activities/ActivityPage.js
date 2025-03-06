import React, { useState, useEffect, useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Image, ActivityIndicator, TextInput, TouchableWithoutFeedback, Keyboard } from 'react-native';
import PreferencesModal from '../Preferences/Preferences';
import { selectEvents, selectPlaces, selectBusinessData, fetchBusinessData, selectStatus, fetchEvents, fetchNearbyPlaces } from '../../Slices/PlacesSlice';
import Activities from './Activities';
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
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
import { useNavigation } from '@react-navigation/native';
import Map from '../Map/Map';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;

const ActivityPage = () => {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const status = useSelector(selectStatus);
    const activities = useSelector(selectPlaces);
    const events = useSelector(selectEvents);
    const eventType = useSelector(selectEventType);
    const businessData = useSelector(selectBusinessData);
    const coordinates = useSelector(selectCoordinates);
    const [prefModalVisible, setPrefModalVisible] = useState(false);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [placeImages, setPlaceImages] = useState({});

    const placeIds = activities?.map(activity => activity.place_id);
    const lat = coordinates?.lat;
    const lng = coordinates?.lng;
    const manualDistance = milesToMeters(10);
    const closeDistance = milesToMeters(3);
    const eventDistance = 50;
    const manualBudget = "$$$$";
    const lowBudget = "$";

    const fetchPlaceImage = async (placeId) => {
        if (placeImages[placeId]) return placeImages[placeId]; // Return cached image if available

        try {
            const response = await fetch(
                `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${GOOGLE_API_KEY}`
            );
            const data = await response.json();
            const photoReference = data?.result?.photos?.[0]?.photo_reference;

            if (photoReference) {
                const imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=100&photoreference=${photoReference}&key=${GOOGLE_API_KEY}`;
                setPlaceImages((prev) => ({ ...prev, [placeId]: imageUrl }));
                return imageUrl;
            }
        } catch (error) {
            console.log("Error fetching place image:", error);
        }

        return null;
    };

    // Detect keyboard open/close state
    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            setKeyboardOpen(true);
        });

        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardOpen(false);
        });

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

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
            dispatch(fetchEvents({ lat, lng, radius: eventDistance }));
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
    };

    const handlePress = async (data, details) => {
        const formattedBusiness = {
            businessName: details?.name || data.structured_formatting.main_text,
            placeId: data.place_id,
            location: details?.formatted_address || data.structured_formatting.secondary_text,
            phone: details?.formatted_phone_number || "Enter a phone number",
            description: details?.editorial_summary?.overview || "Enter a description of your business",
            reviews: details?.reviews || [], // Default empty array if no reviews
        };
    
        navigation.navigate("BusinessProfile", { business: formattedBusiness });
    }; 

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={{ flex: 1 }}>
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
                                    {/* Search Bar */}
                                    <View style={styles.searchContainer}>
                                        <GooglePlacesAutocomplete
                                            placeholder="Search places..."
                                            query={{
                                                key: GOOGLE_API_KEY,
                                                language: "en",
                                                types: "establishment",
                                                location: lat && lng ? `${lat},${lng}` : null,
                                                rankby: "distance",
                                            }}
                                            fetchDetails={true} // Fetch full details for each place
                                            onFail={(error) => console.log("Google Places Error:", error)}
                                            styles={{
                                                textInput: styles.searchInput,
                                                listView: styles.listView,
                                            }}
                                            renderRow={(data) => {
                                                const placeId = data?.place_id;
                                                const terms = data?.terms;

                                                const city = terms?.[2]?.value || "Unknown City";
                                                const state = terms?.[3]?.value || "Unknown State";

                                                // Fetch image if not already stored
                                                if (placeId && !placeImages[placeId]) {
                                                    fetchPlaceImage(placeId);
                                                }

                                                const imageUrl = placeImages[placeId];

                                                console.log(data);

                                                return (
                                                    <TouchableOpacity onPress={() => handlePress(data)}>
                                                        <View style={styles.row}>
                                                            {imageUrl && (
                                                                <Image source={{ uri: imageUrl }} style={styles.placeImage} />
                                                            )}
                                                            <View>
                                                                <Text style={styles.placeText}>{data.structured_formatting.main_text}</Text>
                                                                <Text style={styles.cityStateText}>{city}, {state}</Text>
                                                            </View>
                                                        </View>
                                                    </TouchableOpacity>
                                                );
                                            }}
                                        />

                                    </View>


                                    <Text style={styles.filterTitle}>Quick Filters</Text>

                                    {/* Quick Filter Icons */}
                                    <View style={styles.filterContainer}>
                                        {[
                                            { label: "Date Night", icon: heart, type: "dateNight" },
                                            { label: "Drinks & Dining", icon: tableware, type: "dateAndDining" },
                                            { label: "Events", icon: tickets, type: "events" },
                                            { label: "Outdoor", icon: hiking, type: "outdoor" },
                                            { label: "Movie Night", icon: popcorn, type: "movieNight" },
                                            { label: "Budget Friendly", icon: budgetFriendly, type: "budgetFriendly" },
                                            { label: "Gaming", icon: arcade, type: "gaming" },
                                            { label: "Art & Culture", icon: art, type: "artAndCulture" },
                                            { label: "Family Fun", icon: family, type: "familyFun" },
                                            { label: "Pet Friendly", icon: dog, type: "petFriendly" },
                                            { label: "Live Music", icon: microphone, type: "liveMusic" },
                                            { label: "What's Close", icon: map, type: "whatsClose" },
                                        ].map(({ label, icon, type }) => (
                                            <TouchableOpacity
                                                key={type}
                                                style={[styles.filterItem, keyboardOpen && styles.disabledFilter]} // Style update
                                                onPress={() => !keyboardOpen && handleActivityFetch(type)}
                                                disabled={keyboardOpen} // Disable touchable while keyboard is open
                                            >
                                                <Text style={styles.filterText}>{label}</Text>
                                                <Image source={icon} style={styles.filterIcon} />
                                            </TouchableOpacity>
                                        ))}
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
            </View>
        </TouchableWithoutFeedback>
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
    searchContainer: {
        flexDirection: 'row',
        width: '100%',
        alignSelf: 'center',
    },
    searchInput: {
        flex: 1,
        height: 40,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 15,
        paddingHorizontal: 10,
        backgroundColor: 'white',
    },
    searchButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 15,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 15,
        marginLeft: 10,
    },
    searchButtonText: {
        color: 'white',
        fontWeight: 'bold',
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
        marginTop: 30,
    },
    disabledFilter: {
        opacity: 0.5, // Visually indicate it's disabled
    },
    searchInput: {
        height: 40,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 15,
        paddingHorizontal: 10,
        backgroundColor: "white",
    },
    listView: {
        position: "absolute",
        top: 50,
        backgroundColor: "#fff",
        zIndex: 1000,
        width: "100%",
        borderRadius: 10,
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        padding: 10,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    placeImage: {
        width: 40,
        height: 40,
        borderRadius: 5,
        marginRight: 10,
    },
    placeText: {
        fontSize: 16,
        color: "#333",
    },
});
