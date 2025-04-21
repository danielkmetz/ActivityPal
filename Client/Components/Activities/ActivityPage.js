import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    FlatList,
    StyleSheet,
    Text,
    ActivityIndicator,
    SafeAreaView,
    TouchableWithoutFeedback,
    Keyboard,
    Animated,
} from 'react-native';
import PreferencesModal from '../Preferences/Preferences';
import { selectEvents, selectBusinessData, fetchBusinessData, } from '../../Slices/PlacesSlice';
import { fetchGooglePlaces, selectGooglePlaces, selectGoogleStatus, clearGooglePlaces, fetchDining } from '../../Slices/GooglePlacesSlice';
import Activities from './Activities';
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
import FilterDrawer from './FilterDrawer';
import BottomNavigation from './BottomNavigation'
import SearchBar from './SearchBar';
import QuickFilters from './QuickFilters';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const ActivityPage = ({ scrollY, onScroll, customNavTranslateY }) => {
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
    const [atTop, setAtTop] = useState(true);

    const lat = coordinates?.lat;
    const lng = coordinates?.lng;
    const manualDistance = milesToMeters(10);
    const manualDistanceDining = milesToMeters(5);
    const closeDistance = milesToMeters(3);
    const eventDistance = 50;
    const manualBudget = "$$$$";
    const listRef = useRef(null);

    useEffect(() => {
        if (!(scrollY instanceof Animated.Value)) return;
      
        const listenerId = scrollY.addListener(({ value }) => {
          setAtTop(value <= 5); // or whatever threshold you want
        });
      
        return () => {
          scrollY.removeListener(listenerId);
        };
    }, [scrollY]);      
      
    const handleActivityFetch = (type, isCustom = false, customParams = {}) => {
        if (!lat || !lng) {
            console.warn("Lat/Lng not available yet");
            return;
        }

        setFilterDrawerVisible(false);

        const isQuickFilter = [
            'dateNight', 'drinksAndDining', 'outdoor', 'movieNight',
            'gaming', 'artAndCulture', 'familyFun', 'petFriendly', 'liveMusic', 'whatsClose'
        ].includes(type);

        if (type !== 'Dining') {
        dispatch(fetchGooglePlaces({
            lat,
            lng,
            radius: isCustom ? customParams.radius : manualDistance,
            budget: isCustom ? customParams.budget : manualBudget,
            ...(isQuickFilter ? { quickFilter: type } : { activityType: type })
        }));
        } else {
            dispatch(fetchDining({
                lat,
                lng,
                activityType: type,
                radius: isCustom ? customParams.radius : manualDistanceDining,
                budget: isCustom ? customParams.budget : manualBudget,
                isCustom,
            }));
        }
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
         <View
            style={styles.safeArea}
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
                                            {!isMapView && scrollY instanceof Animated.Value && typeof onScroll === 'function' ? (
                                                <AnimatedFlatList
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
                                                    onScroll={
                                                        Animated.event(
                                                          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                                                          {
                                                            useNativeDriver: true,
                                                            listener: onScroll
                                                          }
                                                        )
                                                    }
                                                    scrollEventThrottle={16}
                                                    ListHeaderComponent={<View style={styles.scrollSpacer} />}
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
                                        <SearchBar
                                            lat={lat}
                                            lng={lng}
                                            onSelectPlace={handlePress}
                                            fetchPlaceImage={fetchPlaceImage}
                                            placeImages={placeImages}
                                            GOOGLE_API_KEY={GOOGLE_API_KEY}
                                        />
                                        <QuickFilters
                                            keyboardOpen={keyboardOpen}
                                            onFilterPress={handleActivityFetch}
                                            icons={{ heart, tableware, tickets, hiking, popcorn, arcade, art, family, dog, microphone, map }}
                                        />
                                    </>
                                )}
                            </>
                        )}
                    </View>
                    {customNavTranslateY && (
                    <Animated.View style={[styles.bottomNavWrapper, { transform: [{ translateY: customNavTranslateY }] }]}>
                        <BottomNavigation
                        onOpenPreferences={handleOpenPreferences}
                        onOpenFilter={() => setFilterDrawerVisible(true)}
                        categoryFilter={categoryFilter}
                        isMapView={isMapView}
                        onToggleMapView={() => setIsMapView(prev => !prev)}
                        onClear={clearSuggestions}
                        />
                    </Animated.View> 
                    )}
                    <PreferencesModal
                        visible={prefModalVisible}
                        onClose={() => setPrefModalVisible(false)}
                        onSubmitCustomSearch={(type, params) => handleActivityFetch(type, true, params)} // 🔥 Pass this handler
                    />

                    {/* 🔽 Filter Drawer - ADD IT HERE */}
                    {filterDrawerVisible && activities.length > 0 && (
                        <FilterDrawer
                            allTypes={allTypes}
                            categoryFilter={categoryFilter}
                            onSelect={(type) => dispatch(setCategoryFilter(type))}
                            onClose={() => setFilterDrawerVisible(false)}
                        />
                    )}
                </View>
            </TouchableWithoutFeedback>
        </View>
    );
};

export default ActivityPage;

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#008080', // Match this to your header color
    },
    scrollSpacer: {
        height: 250, // same as your original SafeAreaView or header height
        backgroundColor: '#008080', // same color as your SafeAreaView background
        marginTop: -200,
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
    bottomNavWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 55, // or adjust to match space above native tab bar
    },
});
