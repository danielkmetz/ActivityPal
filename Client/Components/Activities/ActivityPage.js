import React, { useMemo, useRef, useCallback } from "react";
import { View, FlatList, StyleSheet, Text, ActivityIndicator, TouchableWithoutFeedback, Keyboard, Animated } from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import PreferencesModal from "../Preferences/Preferences";
import Activities from "./Activities";
import Events from "./Events";
import ActivityMap from "../Map/Map";
import SearchBar from "./SearchBar";
import QuickFilters from "./QuickFilters";
import { selectBusinessData, selectIsMapView, toggleMapView, openPreferences } from "../../Slices/PlacesSlice";
import { selectCoordinates, selectManualCoordinates } from "../../Slices/LocationSlice";
import { milesToMeters } from "../../functions";
import { selectPagination, selectSortOptions, resetPagination } from "../../Slices/PaginationSlice";
import buildDisplayList from "../../utils/Activities/buildDisplayList";
import useKeyboardOpen from "../../utils/ui/useKeyboardOpen";
import { filterIcons } from "./filterIcons";
import useActivitySearchController from "./hooks/useActivitySearchController";
import ActivitiesHeaderButtons from "../Header/ActivitiesHeaderButtons";
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
  clearGooglePlaces,
} from "../../Slices/GooglePlacesSlice";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const ActivityPage = ({ scrollY, onScroll }) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const listRef = useRef(null);
  // ----- location -----
  const autoCoordinates = useSelector(selectCoordinates);
  const manualCoordinates = useSelector(selectManualCoordinates);
  const coordinates = manualCoordinates || autoCoordinates;
  const lat = coordinates?.lat;
  const lng = coordinates?.lng;
  // ----- UI prefs -----
  const isMapView = useSelector(selectIsMapView);
  const sortOption = useSelector(selectSortOptions);
  const { perPage, categoryFilter, openNow: isOpenNow } = useSelector(selectPagination);
  // ----- streams -----
  const placesItems = useSelector(selectPlacesItems);
  const eventsItems = useSelector(selectEventsItems);
  const placesStatus = useSelector(selectPlacesStatus);
  const eventsStatus = useSelector(selectEventsStatus);
  const placesLoadingMore = useSelector(selectPlacesLoadingMore);
  const eventsLoadingMore = useSelector(selectEventsLoadingMore);
  const placesHasMore = useSelector(selectPlacesHasMore);
  const eventsHasMore = useSelector(selectEventsHasMore);
  const lastSearch = useSelector(selectLastSearch);
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

  const handleQuickFilterPress = useCallback(
    (key) => {
      const isDining = key === "Dining";

      // Keep the query minimal; the controller should inject lat/lng/perPage/radiusMeters.
      const query = {
        mode: "places",
        source: "quickFilter",
        ...(isDining
          ? { placeCategory: "food_drink", activityType: "Dining" }
          : { quickFilter: key }),
      };

      startSearch(query);
    },
    [startSearch]
  );

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

  const placesDisplayList = useMemo(() => {
    return buildDisplayList({
      activities: placesItems,
      businessData,
      categoryFilter,
      openNowOnly: isOpenNow,
      sortOption,
      whenAtISO: lastSearch?.whenAtISO ?? null,
      debug: __DEV__,
    });
  }, [placesItems, businessData, categoryFilter, isOpenNow, sortOption, lastSearch?.whenAtISO]);

  const eventsDisplayList = useMemo(() => {
    return Array.isArray(eventsItems) ? eventsItems : [];
  }, [eventsItems]);

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

    if (mode === "mixed") return [...taggedEvents, ...taggedPlaces];
    return showEvents ? taggedEvents : taggedPlaces;
  }, [mode, showPlaces, showEvents, placesDisplayList, eventsDisplayList]);

  const hasResults = displayList.length > 0;

  const initialLoading =
    ((showPlaces && placesStatus === "loading" && (placesItems?.length || 0) === 0) ||
      (showEvents && eventsStatus === "loading" && (eventsItems?.length || 0) === 0)) &&
    !hasResults;

  const anyLoadingMore = (showPlaces && placesLoadingMore) || (showEvents && eventsLoadingMore);

  const availableCuisines = useMemo(() => {
    const set = new Set();
    const excluded = new Set(["unknown"]);
    (Array.isArray(placesItems) ? placesItems : []).forEach((a) => {
      const c = (a?.cuisine || "").toLowerCase();
      if (c && !excluded.has(c)) set.add(c);
    });
    return Array.from(set);
  }, [placesItems]);

  const renderItem = useCallback(({ item }) => {
    if (item?._itemType === "event") return <Events event={item} />;
    return <Activities activity={item} />;
  }, []);

  const keyExtractor = useCallback((item, index) => {
    // deterministic, stable keys
    const id = item?.place_id || item?.id || item?._id;
    return id ? String(id) : `idx:${index}`;
  }, []);

  // Map view should only show places markers (not events).
  const canShowMap = isMapView && showPlaces;

  const handleEndReached = useCallback(() => {
    // cursor/pagination gating is handled in the controller, but choose stream intelligently here.
    if (mode === "events") {
      loadMore("events");
      return;
    }

    if (mode === "mixed") {
      // Policy: prefer loading more places (the heavier stream people scroll for),
      // but if places are exhausted and events still have more, load events.
      if (placesHasMore) loadMore("places");
      else if (eventsHasMore) loadMore("events");
      return;
    }

    // mode === "places"
    loadMore("places");
  }, [mode, loadMore, placesHasMore, eventsHasMore]);

  const Header = useMemo(() => {
    return (
      <View>
        <View style={styles.scrollSpacer} />
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
          disableMapToggle={!showPlaces} // map only makes sense when places are visible
          disableClear={!hasResults}
          style={{ paddingHorizontal: 10 }}
        />
        <SearchBar lat={lat} lng={lng} onSelectPlace={handlePress} />
        {!hasResults && (
          <QuickFilters keyboardOpen={keyboardOpen} onFilterPress={handleQuickFilterPress} icons={filterIcons} />
        )}
      </View>
    );
  }, [
    dispatch,
    navigation,
    availableCuisines,
    categoryFilter,
    isMapView,
    showPlaces,
    hasResults,
    lat,
    lng,
    handleQuickFilterPress,
    keyboardOpen,
  ]);

  const useAnimated = scrollY instanceof Animated.Value && typeof onScroll === "function";

  return (
    <View style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          <View style={hasResults ? styles.containerPopulated : styles.container}>
            {initialLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
              </View>
            ) : canShowMap ? (
              <View style={{ flex: 1 }}>
                {Header}
                <ActivityMap
                  activities={placesDisplayList}
                  onEndReached={() => loadMore("places")}
                  loadingMore={anyLoadingMore}
                />
              </View>
            ) : useAnimated ? (
              <AnimatedFlatList
                data={displayList}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                ref={listRef}
                initialNumToRender={Math.min(15, Number(perPage) || 15)}
                windowSize={6}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.5}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                  useNativeDriver: true,
                  listener: onScroll,
                })}
                scrollEventThrottle={16}
                ListHeaderComponent={Header}
                ListFooterComponent={
                  anyLoadingMore ? (
                    <ActivityIndicator size="small" color="#2196F3" style={{ marginVertical: 10 }} />
                  ) : null
                }
                ListEmptyComponent={
                  <Text style={{ textAlign: "center", marginTop: 20 }}>
                    No results. Try changing filters or expanding the radius.
                  </Text>
                }
              />
            ) : (
              <FlatList
                data={displayList}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                ref={listRef}
                initialNumToRender={Math.min(15, Number(perPage) || 15)}
                windowSize={6}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.5}
                ListHeaderComponent={Header}
                ListFooterComponent={
                  anyLoadingMore ? (
                    <ActivityIndicator size="small" color="#2196F3" style={{ marginVertical: 10 }} />
                  ) : null
                }
              />
            )}
          </View>
          <PreferencesModal
            onSubmitCustomSearch={(submittedMode, payload) => {
              if (!lat || !lng) return;

              // normalize radius field so controller can do the right thing
              const radiusMeters = Number(payload?.radiusMeters ?? payload?.radius);

              startSearch({
                source: "custom",
                mode: submittedMode || payload?.mode || "places",
                ...payload,
                ...(Number.isFinite(radiusMeters) ? { radiusMeters } : null),
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
  scrollSpacer: { backgroundColor: "#008080" },
  container: { flex: 1, backgroundColor: "#f5f5f5", paddingBottom: 50, marginTop: 120 },
  containerPopulated: { flex: 1, backgroundColor: "#f5f5f5" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { paddingBottom: 20 },
});
