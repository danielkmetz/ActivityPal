import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { View, FlatList, StyleSheet, Text, ActivityIndicator, TouchableWithoutFeedback, Keyboard, Animated } from "react-native";
import PreferencesModal from "../Preferences/Preferences";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { selectEvents, selectBusinessData, fetchBusinessData, selectIsMapView } from "../../Slices/PlacesSlice";
import { fetchGooglePlaces, selectGooglePlaces, selectGoogleStatus, fetchDining } from "../../Slices/GooglePlacesSlice";
import Activities from "./Activities";
import Events from "./Events";
import { useSelector, useDispatch } from "react-redux";
import { selectEventType } from "../../Slices/PreferencesSlice";
import { selectCoordinates, selectManualCoordinates } from "../../Slices/LocationSlice";
import { milesToMeters } from "../../functions";
import { selectPagination, incrementPage, selectIsOpen, selectSortOptions, resetPage } from "../../Slices/PaginationSlice";
import { useNavigation } from "@react-navigation/native";
import Map from "../Map/Map";
import SearchBar from "./SearchBar";
import QuickFilters from "./QuickFilters";
import sortActivities from "../../utils/sortActivities";
import { fetchPlaceThumbnail, selectPlaceThumbnailsById } from "../../Slices/placePhotosSlice";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const filterIcons = {
  dateNight: (p) => <MaterialCommunityIcons name="heart-outline" {...p} />,
  drinksAndDining: (p) => <MaterialCommunityIcons name="silverware-fork-knife" {...p} />,
  outdoor: (p) => <MaterialCommunityIcons name="pine-tree" {...p} />,
  movieNight: (p) => <MaterialCommunityIcons name="movie-outline" {...p} />,
  gaming: (p) => <MaterialCommunityIcons name="gamepad-variant-outline" {...p} />,
  artAndCulture: (p) => <MaterialCommunityIcons name="palette-outline" {...p} />,
  familyFun: (p) => <MaterialCommunityIcons name="account-group-outline" {...p} />,
  petFriendly: (p) => <MaterialCommunityIcons name="dog" {...p} />,
  liveMusic: (p) => <MaterialCommunityIcons name="music-note-outline" {...p} />,
  whatsClose: (p) => <MaterialCommunityIcons name="map-marker-radius-outline" {...p} />,
  Dining: (p) => <MaterialCommunityIcons name="silverware" {...p} />,
};

const ActivityPage = ({ scrollY, onScroll }) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const status = useSelector(selectGoogleStatus);
  const activities = useSelector(selectGooglePlaces) || [];
  const events = useSelector(selectEvents) || [];
  const eventType = useSelector(selectEventType);

  const businessData = useSelector(selectBusinessData) || [];
  const isMapView = useSelector(selectIsMapView);

  const autoCoordinates = useSelector(selectCoordinates);
  const manualCoordinates = useSelector(selectManualCoordinates);
  const isOpenNow = useSelector(selectIsOpen);

  const sortOption = useSelector(selectSortOptions);
  const { currentPage, perPage, categoryFilter } = useSelector(selectPagination);

  // NEW: place thumbnails stored in Redux, not local component state
  const placeImages = useSelector(selectPlaceThumbnailsById);

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const listRef = useRef(null);

  const coordinates = manualCoordinates ? manualCoordinates : autoCoordinates;
  const lat = coordinates?.lat;
  const lng = coordinates?.lng;

  const manualDistance = milesToMeters(7);
  const manualDistanceDining = milesToMeters(5);
  const manualBudget = "$$$$";

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Make sure you don’t spam fetchBusinessData with duplicates.
  const lastBizIdsRef = useRef(new Set());

  useEffect(() => {
    if (!Array.isArray(activities) || activities.length === 0) return;

    const ids = activities
      .map((a) => a?.place_id)
      .filter(Boolean);

    const unique = Array.from(new Set(ids));
    const missing = unique.filter((id) => !lastBizIdsRef.current.has(id));

    if (missing.length === 0) return;

    missing.forEach((id) => lastBizIdsRef.current.add(id));
    dispatch(fetchBusinessData(missing));
  }, [activities, dispatch]);

  const handleActivityFetch = useCallback(
    (type, isCustom = false, customParams = {}) => {
      if (!lat || !lng) return;

      dispatch(resetPage());

      const isQuickFilter = [
        "dateNight",
        "drinksAndDining",
        "outdoor",
        "movieNight",
        "gaming",
        "artAndCulture",
        "familyFun",
        "petFriendly",
        "liveMusic",
        "whatsClose",
      ].includes(type);

      if (type !== "Dining") {
        dispatch(
          fetchGooglePlaces({
            lat,
            lng,
            radius: isCustom ? customParams.radius : manualDistance,
            budget: isCustom ? customParams.budget : manualBudget,
            ...(isQuickFilter ? { quickFilter: type } : { activityType: type }),
          })
        );
      } else {
        dispatch(
          fetchDining({
            lat,
            lng,
            activityType: type,
            radius: isCustom ? customParams.radius : manualDistanceDining,
            budget: isCustom ? customParams.budget : manualBudget,
            isCustom,
          })
        );
      }
    },
    [dispatch, lat, lng, manualDistance, manualDistanceDining, manualBudget]
  );

  // NEW: this no longer calls Google. It dispatches a thunk that calls your backend.
  const fetchPlaceImage = useCallback(
    async (placeId) => {
      if (!placeId) return null;
      if (placeImages?.[placeId]) return placeImages[placeId];

      try {
        const out = await dispatch(fetchPlaceThumbnail(placeId)).unwrap();
        return out?.url || null;
      } catch {
        return null;
      }
    },
    [dispatch, placeImages]
  );

  const paginateRegular = (full = [], pageNum, per) => {
    const endIndex = pageNum * per;
    return full.slice(0, endIndex);
  };

  // SPEED: build a lookup map for businessData (kills the O(n^2) find loop)
  const businessByPlaceId = useMemo(() => {
    const map = new Map();
    (Array.isArray(businessData) ? businessData : []).forEach((b) => {
      if (b?.placeId) map.set(b.placeId, b);
    });
    return map;
  }, [businessData]);

  const mergedSorted = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const weekday = today.toLocaleDateString("en-US", { weekday: "long" });

    if (!Array.isArray(activities)) return { highlighted: [], regular: [] };

    const merged = activities.map((activity) => {
      const business = businessByPlaceId.get(activity.place_id);

      if (business) {
        const validEvents = (business.events || []).filter((event) => {
          const isOneTimeToday = event.date === todayStr;
          const isRecurringToday = event.recurringDays?.includes(weekday);
          return isOneTimeToday || isRecurringToday;
        });

        const validPromotions = (business.promotions || []).filter((promo) =>
          promo.recurringDays?.includes(weekday)
        );

        return {
          ...activity,
          events: validEvents,
          promotions: validPromotions,
          business: {
            ...business,
            logoFallback: activity.photoUrl,
          },
        };
      }

      // fallback: don’t lie with open_now: true
      return {
        ...activity,
        events: [],
        promotions: [],
        opening_hours: { open_now: null },
        business: {
          placeId: activity.place_id,
          businessName: activity.name,
          location: activity.address || activity.formatted_address || "",
          logoFallback: activity.photoUrl,
          phone: "",
          description: "",
          events: [],
          promotions: [],
        },
      };
    });

    const highlighted = merged.filter((i) => (i.events?.length || 0) > 0 || (i.promotions?.length || 0) > 0);

    const regular = merged
      .filter((i) => (i.events?.length || 0) === 0 && (i.promotions?.length || 0) === 0)
      .sort((a, b) => {
        const aDist = typeof a.distance === "number" ? a.distance : Infinity;
        const bDist = typeof b.distance === "number" ? b.distance : Infinity;
        return aDist - bDist;
      });

    return { highlighted, regular };
  }, [activities, businessByPlaceId]);

  const { highlighted, regular } = mergedSorted;

  const handlePress = (data, details) => {
    const formattedBusiness = {
      businessName: details?.name || data.structured_formatting?.main_text,
      placeId: data.place_id,
      location: details?.formatted_address || data.structured_formatting?.secondary_text,
      phone: details?.formatted_phone_number || "Enter a phone number",
      description: details?.editorial_summary?.overview || "Enter a description of your business",
      reviews: details?.reviews || [],
      cuisine: details?.cuisine,
    };

    navigation.navigate("BusinessProfile", { business: formattedBusiness });
  };

  const handleLoadMore = () => dispatch(incrementPage());

  const filteredDisplayList = useMemo(() => {
    const safeRegular = Array.isArray(regular) ? regular : [];
    const safeHighlighted = Array.isArray(highlighted) ? highlighted : [];

    const combinedList = [...safeHighlighted, ...safeRegular].filter((item) => item && typeof item === "object");

    const categoryFiltered =
      Array.isArray(categoryFilter) && categoryFilter.length > 0
        ? combinedList.filter((item) =>
            categoryFilter.some((filter) => item.cuisine?.toLowerCase() === filter.toLowerCase())
          )
        : combinedList;

    const openNowFiltered = isOpenNow
      ? categoryFiltered.filter((item) => item.opening_hours?.open_now === true)
      : categoryFiltered;

    const sorted = sortOption ? sortActivities(openNowFiltered, sortOption) : openNowFiltered;

    return paginateRegular(sorted, currentPage, perPage);
  }, [highlighted, regular, currentPage, perPage, categoryFilter, isOpenNow, sortOption]);

  return (
    <View style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          <View style={activities.length > 0 ? styles.containerPopulated : styles.container}>
            {status === "loading" ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
              </View>
            ) : (
              <>
                {events.length > 0 || activities.length > 0 ? (
                  <View style={{ flex: 1 }}>
                    {!isMapView && scrollY instanceof Animated.Value && typeof onScroll === "function" ? (
                      <AnimatedFlatList
                        data={filteredDisplayList}
                        keyExtractor={(item) => item.place_id ?? item.id ?? item.reference}
                        renderItem={({ item }) =>
                          eventType !== "Event" ? <Activities activity={item} /> : <Events event={item} />
                        }
                        initialNumToRender={perPage}
                        ref={listRef}
                        windowSize={5}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.5}
                        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                          useNativeDriver: true,
                          listener: onScroll,
                        })}
                        scrollEventThrottle={16}
                        ListHeaderComponent={<View style={styles.scrollSpacer} />}
                        ListFooterComponent={
                          !categoryFilter && filteredDisplayList.length < highlighted.length + regular.length ? (
                            <ActivityIndicator size="small" color="#2196F3" style={{ marginVertical: 10 }} />
                          ) : null
                        }
                        ListEmptyComponent={<Text style={{ textAlign: "center", marginTop: 20 }}>No results</Text>}
                      />
                    ) : (
                      <Map
                        activities={filteredDisplayList}
                        onEndReached={handleLoadMore}
                        loadingMore={filteredDisplayList.length < highlighted.length + regular.length}
                      />
                    )}
                  </View>
                ) : (
                  <>
                    <SearchBar
                      lat={lat}
                      lng={lng}
                      onSelectPlace={handlePress}
                      fetchPlaceImage={fetchPlaceImage}
                      placeImages={placeImages}
                    />
                    <QuickFilters keyboardOpen={keyboardOpen} onFilterPress={handleActivityFetch} icons={filterIcons} />
                  </>
                )}
              </>
            )}
          </View>
          <PreferencesModal onSubmitCustomSearch={(type, params) => handleActivityFetch(type, true, params)} />
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
};

export default ActivityPage;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#008080" },
  scrollSpacer: { backgroundColor: "#008080", marginTop: 100 },
  container: { flex: 1, backgroundColor: "#f5f5f5", paddingBottom: 50, marginTop: 120 },
  containerPopulated: { flex: 1, backgroundColor: "#f5f5f5" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { paddingBottom: 20 },
});
