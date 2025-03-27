import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    Text,
    Image,
    ActivityIndicator,
    SafeAreaView,
    TouchableWithoutFeedback,
    Keyboard,
} from 'react-native';
import PreferencesModal from '../Preferences/Preferences';
import { selectEvents, selectBusinessData, fetchBusinessData, } from '../../Slices/PlacesSlice';
import { fetchGooglePlaces, selectGooglePlaces, selectGoogleStatus, clearGooglePlaces } from '../../Slices/GooglePlacesSlice';
import Activities from './Activities';
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import Events from './Events';
import { useSelector, useDispatch } from 'react-redux';
import { selectEventType } from '../../Slices/PreferencesSlice';
import { selectCoordinates } from '../../Slices/LocationSlice';
import { milesToMeters } from '../../functions';
import { selectPagination, incrementPage, resetPagination, setCategoryFilter } from '../../Slices/PaginationSlice';
import heart from '../../assets/pics/heart2.png';
import tableware from '../../assets/pics/tableware.webp';
import tickets from '../../assets/pics/tickets2.png';
import hiking from '../../assets/pics/hiking.png';
import popcorn from '../../assets/pics/popcorn.png';
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
    const status = useSelector(selectGoogleStatus);
    const activities = useSelector(selectGooglePlaces);
    const events = useSelector(selectEvents);
    const eventType = useSelector(selectEventType);
    const businessData = useSelector(selectBusinessData);
    const coordinates = useSelector(selectCoordinates);
    const [prefModalVisible, setPrefModalVisible] = useState(false);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [placeImages, setPlaceImages] = useState({});
    const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
    const [isMapView, setIsMapView] = useState(false);
    const { currentPage, perPage, categoryFilter } = useSelector(selectPagination);

    const lat = coordinates?.lat;
    const lng = coordinates?.lng;
    const manualDistance = milesToMeters(5);
    const closeDistance = milesToMeters(3);
    const eventDistance = 50;
    const manualBudget = "$$$$";
    const listRef = useRef(null);

    const handleActivityFetch = (type) => {
        if (!lat || !lng) {
            console.warn("Lat/Lng not available yet");
            return;
        }

        dispatch(fetchGooglePlaces({
            lat,
            lng,
            activityType: type,
            radius: manualDistance,
            budget: manualBudget,
        }));
    };

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

    const paginateRegular = (fullRegular = [], pageNum, perPage) => {
        const endIndex = pageNum * perPage;
        return fullRegular.slice(0, endIndex);
    };    
    
    const clearSuggestions = () => {
        if (activities.length > 0) {
            dispatch(clearGooglePlaces());
            dispatch(resetPagination());
        }
    };

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
        if (activities?.length > 0) {
            const placeIds = activities.map(activity => activity.place_id);
            dispatch(fetchBusinessData(placeIds));
        }
    }, [activities]);
    
    // Merge business events into activities only when businessData is available
    const mergedSorted = useMemo(() => {
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];
        const weekday = today.toLocaleDateString("en-US", { weekday: "long" });
    
        const merged = activities.map(activity => {
            const business = businessData.find(biz => biz.placeId === activity.place_id);
    
            if (business) {
                const validEvents = (business.events || []).filter(event => {
                    const isOneTimeToday = event.date === todayStr;
                    const isRecurringToday = event.recurringDays?.includes(weekday);
                    return isOneTimeToday || isRecurringToday;
                });
    
                const validPromotions = (business.promotions || []).filter(promo =>
                    promo.recurringDays?.includes(weekday)
                );
    
                return {
                    ...activity,
                    events: validEvents,
                    promotions: validPromotions,
                    business,
                };
            }
    
            return { ...activity, events: [], promotions: [] };
        });
    
        const highlighted = merged.filter(item => item.events?.length > 0 || item.promotions?.length > 0);
        const regular = merged.filter(item => item.events?.length === 0 && item.promotions?.length === 0);
    
        return { highlighted, regular };
    }, [activities, businessData]);

    const { highlighted, regular } = mergedSorted;

    const handleOpenPreferences = () => setPrefModalVisible(true);

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

    const handleLoadMore = () => {
        dispatch(incrementPage());
    };    
    const allTypes = useMemo(() => {
        const combined = [...highlighted, ...regular];
        const all = new Set();

        combined.forEach(item => {
            item.types?.forEach(type => {
                // Skip generic types
                if (!["point_of_interest", "establishment"].includes(type)) {
                    all.add(type);
                }
            });
        });

        return Array.from(all).slice(0, 10); // Optional: limit to top 10
    }, [highlighted, regular]);

    const filteredDisplayList = useMemo(() => {
        const paginatedRegular = paginateRegular(regular, currentPage, perPage);
        const combinedList = [...highlighted, ...paginatedRegular];
    
        const filtered = categoryFilter
            ? combinedList.filter(item => item.types?.includes(categoryFilter))
            : combinedList;
    
        return filtered;
    }, [highlighted, regular, currentPage, perPage, categoryFilter]);
       
    return (
        <SafeAreaView
            style={[
                styles.safeArea,
                activities.length === 0 && { marginTop: -50, backgroundColor: 'transparent' }
            ]}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <View style={{ flex: 1 }}>
                    <View style={activities.length > 0 ? styles.containerPopulated : styles.container}>
                        {status === "loading" ? (
                            // Show loading indicator while fetching data
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#2196F3" />
                            </View>
                        ) : (
                            <>
                                {events.length > 0 || activities.length > 0 ? (
                                    <>
                                        <View style={{ flex: 1 }}>
                                            {!isMapView ? (
                                                <FlatList
                                                    data={filteredDisplayList}
                                                    keyExtractor={(item) => item.place_id ?? item.id ?? item.reference}
                                                    renderItem={({ item }) =>
                                                        eventType !== "Event" ? (
                                                            <Activities activity={item} />
                                                        ) : (
                                                            <Events event={item} />
                                                        )
                                                    }
                                                    initialNumToRender={perPage}
                                                    ref={listRef}
                                                    windowSize={5}
                                                    contentContainerStyle={styles.list}
                                                    showsVerticalScrollIndicator={false}
                                                    onEndReached={handleLoadMore}
                                                    onEndReachedThreshold={0.5}
                                                    ListFooterComponent={
                                                        filteredDisplayList.length < highlighted.length + regular.length ? (
                                                            <ActivityIndicator size="small" color="#2196F3" style={{ marginVertical: 10 }} />
                                                        ) : null
                                                    }
                                                    ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>No results</Text>}
                                                />
                                            ) : (
                                                <Map 
                                                    activities={filteredDisplayList}
                                                    onEndReached={handleLoadMore}
                                                    loadingMore={filteredDisplayList.length < highlighted.length + regular.length} 
                                                />
                                            )}
                                        </View>

                                    </>
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
                                                { label: "Drinks & Dining", icon: tableware, type: "drinksAndDining" },
                                                { label: "Events", icon: tickets, type: "events" },
                                                { label: "Outdoor", icon: hiking, type: "outdoor" },
                                                { label: "Movie Night", icon: popcorn, type: "movieNight" },
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
                        <View style={styles.bottomNav}>
                            <TouchableOpacity style={styles.navButton} onPress={handleOpenPreferences}>
                                <Text style={styles.navButtonText}>Preferences</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.navButton} onPress={() => setFilterDrawerVisible(true)}>
                                <Text style={styles.navButtonText}>
                                    {categoryFilter ? `Filter: ${categoryFilter.replace(/_/g, ' ')}` : 'Filter'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.navButton} onPress={() => setIsMapView(prev => !prev)}>
                                <Text style={styles.navButtonText}>
                                    {isMapView ? 'List View' : 'Map View'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.navButton} onPress={clearSuggestions}>
                                <Text style={styles.navButtonText}>
                                    Clear
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <PreferencesModal
                        visible={prefModalVisible}
                        onClose={() => setPrefModalVisible(false)}
                    />

                    {/* 🔽 Filter Drawer - ADD IT HERE */}
                    {filterDrawerVisible && (
                        <View style={styles.drawerOverlay}>
                            <View style={styles.drawerContainer}>
                                <Text style={styles.drawerTitle}>Filter Categories</Text>
                                <FlatList
                                    data={allTypes}
                                    keyExtractor={(item) => item}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={[
                                                styles.drawerItem,
                                                item === categoryFilter && styles.drawerItemActive,
                                            ]}
                                            onPress={() => {
                                                setCategoryFilter(item === categoryFilter ? null : item);
                                                setFilterDrawerVisible(false);
                                            }}
                                        >
                                            <Text style={styles.drawerItemText}>
                                                {item.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                />
                                <TouchableOpacity
                                    style={styles.drawerCloseButton}
                                    onPress={() => setFilterDrawerVisible(false)}
                                >
                                    <Text style={styles.drawerCloseText}>Close</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </TouchableWithoutFeedback>
        </SafeAreaView>
    );
};

export default ActivityPage;

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#008080', // Match this to your header color
    },
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        marginTop: 130,
        paddingBottom: 50,
    },
    containerPopulated: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        paddingBottom: 50,
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
    headerButtons: {
        position: 'absolute',
        top: 10, // adjust based on your app header height
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
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
    filterBar: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 10,
        marginBottom: 10,
        justifyContent: 'center',
    },
    filterChip: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: '#ddd',
        marginHorizontal: 5,
        marginBottom: 10,
    },
    activeChip: {
        backgroundColor: '#2196F3',
    },
    chipText: {
        color: '#000',
        fontWeight: '500',
    },
    dropdownTrigger: {
        padding: 10,
        backgroundColor: '#2196F3',
        borderRadius: 8,
        marginHorizontal: 20,
        marginBottom: 10,
    },
    dropdownText: {
        color: 'white',
        textAlign: 'center',
        fontWeight: 'bold',
    },

    drawerOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end',
    },

    drawerContainer: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '60%',
    },

    drawerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },

    drawerItem: {
        paddingVertical: 12,
    },

    drawerItemActive: {
        backgroundColor: '#e0f0ff',
        borderRadius: 10,
    },

    drawerItemText: {
        fontSize: 16,
    },

    drawerCloseButton: {
        marginTop: 20,
        alignSelf: 'center',
        padding: 10,
    },

    drawerCloseText: {
        color: '#2196F3',
        fontWeight: 'bold',
    },
    bottomNav: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        flexDirection: 'row',
        backgroundColor: '#008080',
        borderTopWidth: 1,
        borderTopColor: '#ddd',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        alignItems: 'center',       // Ensures buttons are centered vertically
        paddingHorizontal: 10       // Adds edge spacing
    },  
    navButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    navButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
        textAlign: 'center',
    },
});
