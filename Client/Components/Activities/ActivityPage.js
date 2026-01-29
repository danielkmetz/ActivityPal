import React, { useMemo, useRef } from "react";
import { View, FlatList, StyleSheet, Text, ActivityIndicator, TouchableWithoutFeedback, Keyboard, Animated } from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import PreferencesModal from "../Preferences/Preferences";
import Activities from "./Activities";
import Events from "./Events";
import ActivityMap from "../Map/Map";
import SearchBar from "./SearchBar";
import QuickFilters from "./QuickFilters";
import { selectBusinessData, selectIsMapView, toggleMapView, openPreferences, selectEvents as selectOverlayEvents } from "../../Slices/PlacesSlice";
import { selectEventType } from "../../Slices/PreferencesSlice";
import { selectCoordinates, selectManualCoordinates } from "../../Slices/LocationSlice";
import { milesToMeters } from "../../functions";
import { selectPagination, selectSortOptions, resetPagination } from "../../Slices/PaginationSlice";
import buildDisplayList from "../../utils/Activities/buildDisplayList";
import useKeyboardOpen from "../../utils/ui/useKeyboardOpen";
import { filterIcons } from "./filterIcons";
import useActivitySearchController from "./hooks/useActivitySearchController";
import ActivitiesHeaderButtons from '../Header/ActivitiesHeaderButtons';
import {
  selectPlacesItems,
  selectEventsItems,
  selectPlacesStatus,
  selectEventsStatus,
  selectPlacesLoadingMore,
  selectEventsLoadingMore,
  selectPlacesHasMore,
  selectEventsHasMore,
  selectLastSearch,
  startActivitiesSearch, // orchestration thunk
} from "../../Slices/GooglePlacesSlice";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const ActivityPage = ({ scrollY, onScroll }) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const listRef = useRef(null);

  // ----- location -----
  const autoCoordinates = useSelector(selectCoordinates);
  const manualCoordinates = useSelector(selectManualCoordinates);
  const coordinates = manualCoordinates ? manualCoordinates : autoCoordinates;
  const lat = coordinates?.lat;
  const lng = coordinates?.lng;

  // ----- UI prefs -----
  const isMapView = useSelector(selectIsMapView);
  const sortOption = useSelector(selectSortOptions);
  const { perPage, categoryFilter, openNow: isOpenNow } = useSelector(selectPagination);

  // You still have this in your app; leaving it here but it should eventually die.
  // Mode should be controlled by lastSearch.mode, not an unrelated toggle.
  const legacyEventType = useSelector(selectEventType);

  // ----- streams (NEW) -----
  const placesItems = useSelector(selectPlacesItems);
  const eventsItems = useSelector(selectEventsItems);

  const placesStatus = useSelector(selectPlacesStatus);
  const eventsStatus = useSelector(selectEventsStatus);
  const placesLoadingMore = useSelector(selectPlacesLoadingMore);
  const eventsLoadingMore = useSelector(selectEventsLoadingMore);

  const placesHasMore = useSelector(selectPlacesHasMore);
  const eventsHasMore = useSelector(selectEventsHasMore);

  const lastSearch = useSelector(selectLastSearch);

  // Existing overlay events from PlacesSlice (if you still need them)
  // If this is old/unused, delete it.
  const overlayEvents = useSelector(selectOverlayEvents) || [];

  const businessData = useSelector(selectBusinessData) || [];

  // ----- derive mode -----
  const mode = lastSearch?.mode || "places"; // "places" | "events" | "mixed"
  const showPlaces = mode === "places" || mode === "mixed";
  const showEvents = mode === "events" || mode === "mixed";

  const keyboardOpen = useKeyboardOpen();

  const statusByStream = useMemo(
    () => ({ places: placesStatus, events: eventsStatus }),
    [placesStatus, eventsStatus]
  );

  const loadingMoreByStream = useMemo(
    () => ({ places: placesLoadingMore, events: eventsLoadingMore }),
    [placesLoadingMore, eventsLoadingMore]
  );

  const hasMoreByStream = useMemo(
    () => ({ places: placesHasMore, events: eventsHasMore }),
    [placesHasMore, eventsHasMore]
  );

  const { startSearch, loadMore } = useActivitySearchController({
    dispatch,
    lat,
    lng,
    perPage,
    statusByStream,
    loadingMoreByStream,
    hasMoreByStream,
    lastSearch,
    defaultRadiusMeters: milesToMeters(7),
    defaultDiningRadiusMeters: milesToMeters(5),
  });

  const handleQuickFilterPress = (key) => {
    // This maps the UI quick filter key to the backend query
    // Backend expects quickFilter for places2, and may use activityType for dining cursor route.
    const isDining = key === "Dining";

    const query = {
      mode: "places",
      source: "quickFilter",

      // IMPORTANT: your fetchPlacesPage uses placeCategory === "food_drink" to route to dining cursor pipeline.
      // If you want Dining to use that pipeline, you must set placeCategory.
      ...(isDining
        ? { placeCategory: "food_drink", activityType: "Dining" }
        : { quickFilter: key }),
    };

    startSearch(query);
  };

  const handlePress = (data, details) => {
    const formattedBusiness = {
      businessName: details?.name || data?.structured_formatting?.main_text,
      placeId: data?.place_id,
      location: details?.formatted_address || data?.structured_formatting?.secondary_text,
      phone: details?.formatted_phone_number || "Enter a phone number",
      description: details?.editorial_summary?.overview || "Enter a description of your business",
      reviews: details?.reviews || [],
      cuisine: details?.cuisine,
    };

    navigation.navigate("BusinessProfile", { business: formattedBusiness });
  };

  // Build a good places list (your existing helper)
  const placesDisplayList = useMemo(() => {
    return buildDisplayList({
      activities: placesItems,
      businessData,
      categoryFilter,
      openNowOnly: isOpenNow,
      sortOption,
      whenAtISO: lastSearch?.whenAtISO ?? null,
      debug: __DEV__, // or a toggle
    });
  }, [placesItems, businessData, categoryFilter, isOpenNow, sortOption, lastSearch?.whenAtISO]);

  // Events list (simple for now; sort in the backend ideally)
  const eventsDisplayList = useMemo(() => {
    return Array.isArray(eventsItems) ? eventsItems : [];
  }, [eventsItems]);

  // Mixed mode: tag items so renderItem can pick the right component
  const displayList = useMemo(() => {
    const taggedPlaces = showPlaces
      ? (Array.isArray(placesDisplayList) ? placesDisplayList : []).map((p) => ({
        ...p,
        _itemType: "place",
      }))
      : [];

    const taggedEvents = showEvents
      ? (Array.isArray(eventsDisplayList) ? eventsDisplayList : []).map((e) => ({
        ...e,
        _itemType: "event",
      }))
      : [];

    // If you want more sophisticated interleaving, do it here.
    // For now: events first, then places.
    return mode === "mixed" ? [...taggedEvents, ...taggedPlaces] : showEvents ? taggedEvents : taggedPlaces;
  }, [mode, showPlaces, showEvents, placesDisplayList, eventsDisplayList]);

  const initialLoading =
    (showPlaces && placesStatus === "loading" && (placesItems?.length || 0) === 0) ||
    (showEvents && eventsStatus === "loading" && (eventsItems?.length || 0) === 0);

  const anyLoadingMore =
    (showPlaces && placesLoadingMore) ||
    (showEvents && eventsLoadingMore);

  const hasAnyResults =
    (Array.isArray(placesItems) && placesItems.length > 0) ||
    (Array.isArray(eventsItems) && eventsItems.length > 0) ||
    (Array.isArray(overlayEvents) && overlayEvents.length > 0);

  const availableCuisines = useMemo(() => {
    const set = new Set();
    const excluded = new Set(["unknown"]);
    (Array.isArray(placesItems) ? placesItems : []).forEach((a) => {
      const c = (a?.cuisine || "").toLowerCase();
      if (c && !excluded.has(c)) set.add(c);
    });
    return Array.from(set);
  }, [placesItems]);

  // If your legacyEventType is still used to force event rendering,
  // this keeps your current UI behavior. But it conflicts with "mode".
  // You should remove legacyEventType and rely on mode/_itemType.
  const renderItem = ({ item }) => {
    if (item?._itemType === "event" || legacyEventType === "Event") {
      return <Events event={item} />;
    }
    return <Activities activity={item} />;
  };

  // Map view should only show places (markers). Mixed/events should stay list.
  const canShowMap = isMapView && showPlaces;

  return (
    <View style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          <View style={hasAnyResults ? styles.containerPopulated : styles.container}>
            {initialLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
              </View>
            ) : (
              <>
                {hasAnyResults ? (
                  <View style={{ flex: 1 }}>
                    {!canShowMap && scrollY instanceof Animated.Value && typeof onScroll === "function" ? (
                      <AnimatedFlatList
                        data={displayList}
                        keyExtractor={(item) => {
                          const key = item?.place_id || item?.id || item?._id || item?.reference;
                          return String(key || Math.random());
                        }}
                        renderItem={renderItem}
                        initialNumToRender={perPage}
                        ref={listRef}
                        windowSize={5}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        onEndReached={() => {
                          if (mode === "events") loadMore("events");
                          else loadMore("places"); // "places" or "mixed" -> load more places first
                        }}
                        onEndReachedThreshold={0.5}
                        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                          useNativeDriver: true,
                          listener: onScroll,
                        })}
                        scrollEventThrottle={16}
                        ListHeaderComponent={<View style={styles.scrollSpacer} />}
                        ListFooterComponent={
                          anyLoadingMore ? (
                            <ActivityIndicator size="small" color="#2196F3" style={{ marginVertical: 10 }} />
                          ) : null
                        }
                        ListEmptyComponent={<Text style={{ textAlign: "center", marginTop: 20 }}>No results</Text>}
                      />
                    ) : (
                      <ActivityMap
                        activities={placesDisplayList}
                        onEndReached={() => loadMore("places")}
                        loadingMore={anyLoadingMore}
                      />
                    )}
                  </View>
                ) : (
                  <>
                    <ActivitiesHeaderButtons
                      onOpenPreferences={() => dispatch(openPreferences())}
                      onOpenFilter={() => navigation.navigate("FilterSort", { availableCuisines })}
                      onToggleMapView={() => dispatch(toggleMapView())}
                      onClear={() => {
                        dispatch(clearGooglePlaces());
                        dispatch(resetPagination());
                      }}
                      categoryFilter={categoryFilter}
                      isMapView={isMapView}
                      disableMapToggle={!hasAnyResults}  // map view is pointless with nothing
                      disableClear={!hasAnyResults}      // optional
                      style={{ paddingHorizontal: 10 }}  // optional spacing tweak
                    />
                    <SearchBar lat={lat} lng={lng} onSelectPlace={handlePress} />
                    <QuickFilters
                      keyboardOpen={keyboardOpen}
                      onFilterPress={handleQuickFilterPress}
                      icons={filterIcons}
                    />
                  </>
                )}
              </>
            )}
          </View>
          <PreferencesModal
            onSubmitCustomSearch={(submittedMode, payload) => {
              if (!lat || !lng) return;

              startSearch({
                source: "custom",
                mode: submittedMode || payload?.mode || "places",
                ...payload,
              });
            }}
          />
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
