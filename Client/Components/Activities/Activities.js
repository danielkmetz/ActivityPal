import React, { useState, useRef, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Image, TouchableWithoutFeedback, TouchableOpacity, Animated, Easing } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { fetchEventById } from "../../Slices/EventsSlice";
import { fetchPromotionById } from "../../Slices/PromotionsSlice";
import { useDispatch } from "react-redux";
import { logEngagementIfNeeded, getEngagementTarget } from "../../Slices/EngagementSlice";

const API_URL = process.env.EXPO_PUBLIC_SERVER_URL || "";

function normalizeUri(maybeUrl) {
  if (!maybeUrl) return null;
  if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;

  const base = API_URL.replace(/\/$/, "");
  const path = maybeUrl.startsWith("/") ? maybeUrl : `/${maybeUrl}`;
  return `${base}${path}`;
}

const Activities = ({ activity }) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const [showEvents, setShowEvents] = useState(false);
  const [showPromotions, setShowPromotions] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const events = Array.isArray(activity?.events) ? activity.events : [];
  const promotions = Array.isArray(activity?.promotions) ? activity.promotions : [];
  const photoUri = useMemo(() => normalizeUri(activity?.photoUrl), [activity?.photoUrl]);
  const isClosed = activity?.openNow === false || activity?.openingHours?.openNow === false;

  const handlePress = () => {
    if (activity?.business) {
      navigation.navigate("BusinessProfile", { business: activity.business });
    }
  };

  const handleEventPromoPress = (item, type) => {
    const placeId = item?.placeId || item?.business?.placeId || activity?.place_id || activity?.business?.placeId;

    if (type === "event") dispatch(fetchEventById(item._id));
    else dispatch(fetchPromotionById(item._id));

    const { targetType, targetId } = getEngagementTarget(item);
    logEngagementIfNeeded(dispatch, {
      targetType,
      targetId,
      placeId,
      engagementType: "click",
    });

    navigation.navigate("EventDetails", { activity: item });
  };

  const shouldPulse = events.length > 0 || promotions.length > 0;

  useEffect(() => {
    if (!shouldPulse) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    return () => pulse.stop();
  }, [shouldPulse, scaleAnim]);

  if (!activity) return null;

  return (
    <TouchableWithoutFeedback onPress={handlePress}>
      <View style={styles.container}>
        {/* Photo */}
        {!!photoUri && (
          <View style={styles.imageWrapper}>
            <Image source={{ uri: photoUri }} style={styles.photo} />
            {isClosed && (
              <View style={styles.closedOverlay}>
                <Text style={styles.closedText}>Closed</Text>
              </View>
            )}
          </View>
        )}
        {/* Basic Info */}
        <View style={styles.infoContainer}>
          {!!activity.name && <Text style={styles.name}>{activity.name}</Text>}
          {!!activity.address && <Text style={styles.vicinity}>{activity.address}</Text>}
          {activity.distance != null && (
            <Text style={styles.vicinity}>{Number(activity.distance).toFixed(3)} miles</Text>
          )}
        </View>
        {/* EVENTS DROPDOWN */}
        {events.length > 0 && (
          <View style={styles.dropdownContainer}>
            <TouchableOpacity
              onPress={() => setShowEvents((s) => !s)}
              style={styles.dropdownHeader}
              activeOpacity={0.8}
            >
              <View style={styles.starRow}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <Text style={styles.star}>⭐</Text>
                </Animated.View>
                <Text style={styles.dropdownTitle}>Events Today!</Text>
              </View>
              <Text style={styles.dropIcon}>{showEvents ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {showEvents && (
              <View style={styles.dropdownContent}>
                {events.map((event) => (
                  <View key={event?._id || event?.id || event?.title} style={styles.dropdownItem}>
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
        {promotions.length > 0 && (
          <View style={styles.dropdownContainer}>
            <TouchableOpacity
              onPress={() => setShowPromotions((s) => !s)}
              style={styles.dropdownHeader}
              activeOpacity={0.8}
            >
              <View style={styles.starRow}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <Text style={styles.star}>⭐</Text>
                </Animated.View>
                <Text style={styles.dropdownTitle}>Promotions Today!</Text>
              </View>
              <Text style={styles.dropIcon}>{showPromotions ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {showPromotions && (
              <View style={styles.dropdownContent}>
                {promotions.map((promo) => (
                  <View key={promo?._id || promo?.id || promo?.title} style={styles.dropdownItem}>
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
    backgroundColor: "white",
    marginVertical: 8,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  photo: {
    width: "100%",
    height: 200,
    marginBottom: 8,
  },
  infoContainer: {
    padding: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  vicinity: {
    fontSize: 14,
    color: "#666",
  },
  imageWrapper: {
    position: "relative",
  },
  closedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  closedText: {
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
    textTransform: "uppercase",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 20,
    paddingVertical: 5,
    borderRadius: 5,
    transform: [{ rotate: "-20deg" }],
  },
  dropdownContainer: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  dropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: "#ccc",
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  dropIcon: {
    marginRight: 10,
  },
  dropdownContent: {
    paddingVertical: 6,
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  itemText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
    marginRight: 10,
  },
  detailsButton: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "600",
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  star: {
    fontSize: 18,
    marginRight: 10,
  },
});
