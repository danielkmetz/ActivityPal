import React, { useMemo, useRef } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
} from "react-native";
import PreferencesModal from "../Preferences/Preferences";
import { useSelector, useDispatch } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import { selectEvents, selectBusinessData, selectIsMapView } from "../../Slices/PlacesSlice";
import { selectGooglePlaces, selectGoogleStatus, selectGoogleMeta, selectGooglePage, selectGoogleLastQuery, selectGoogleLoadingMore } from "../../Slices/GooglePlacesSlice";
import { selectEventType } from "../../Slices/PreferencesSlice";
import { selectCoordinates, selectManualCoordinates } from "../../Slices/LocationSlice";
import { milesToMeters } from "../../functions";
import { selectPagination, selectSortOptions } from "../../Slices/PaginationSlice";
import Activities from "./Activities";
import Events from "./Events";
import ActivityMap from "../Map/Map";
import SearchBar from "./SearchBar";
import QuickFilters from "./QuickFilters";
import useActivitySearchController from "./hooks/useActivitySearchController";
import buildDisplayList from "../../utils/Activities/buildDisplayList";
import useKeyboardOpen from "../../utils/ui/useKeyboardOpen";
import { filterIcons } from "./filterIcons";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

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
  const sortOption = useSelector(selectSortOptions);
  const meta = useSelector(selectGoogleMeta);
  const serverPage = useSelector(selectGooglePage); // still used for /places2 offset pagination
  const lastQuery = useSelector(selectGoogleLastQuery);
  const loadingMore = useSelector(selectGoogleLoadingMore);
  const { perPage, categoryFilter, openNow: isOpenNow } = useSelector(selectPagination);
  const listRef = useRef(null);
  const coordinates = manualCoordinates ? manualCoordinates : autoCoordinates;
  const lat = coordinates?.lat;
  const lng = coordinates?.lng;
  const manualDistance = milesToMeters(7);
  const manualDistanceDining = milesToMeters(5);
  const manualBudget = "$$$$";
  const rawCount = Array.isArray(activities) ? activities.length : 0;

  // Cursor-based pagination (Dining) OR legacy total-based pagination (places2)
  const cursor = typeof meta?.cursor === "string" && meta.cursor.trim() ? meta.cursor.trim() : null;

  const hasMore =
    typeof meta?.hasMore === "boolean"
      ? meta.hasMore
      : typeof meta?.total === "number"
        ? rawCount < meta.total
        : false;

  const keyboardOpen = useKeyboardOpen();

  const { handleActivityFetch, handleLoadMore } = useActivitySearchController({
    dispatch,
    lat,
    lng,
    perPage,
    manualDistance,
    manualDistanceDining,
    manualBudget,
    status,
    loadingMore,
    hasMore,
    cursor, // NEW: used for Dining cursor pagination
    lastQuery,
    serverPage,
    onNewSearchReset: () => {
      // If you bring these back, this is still the right place to reset them
      // resetPhotoQueue();
      // resetFetchedIds();
    },
  });

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

  const displayList = useMemo(() => {
    return buildDisplayList({
      activities,
      businessData,
      categoryFilter,
      openNowOnly: isOpenNow,
      sortOption,
    });
  }, [activities, businessData, categoryFilter, isOpenNow, sortOption]);

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
                        data={displayList}
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
                          loadingMore ? (
                            <ActivityIndicator size="small" color="#2196F3" style={{ marginVertical: 10 }} />
                          ) : null
                        }
                        ListEmptyComponent={<Text style={{ textAlign: "center", marginTop: 20 }}>No results</Text>}
                      />
                    ) : (
                      <ActivityMap activities={displayList} onEndReached={handleLoadMore} loadingMore={loadingMore} />
                    )}
                  </View>
                ) : (
                  <>
                    <SearchBar lat={lat} lng={lng} onSelectPlace={handlePress} />
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
