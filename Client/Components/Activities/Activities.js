import React, { useState, useRef, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Image, TouchableWithoutFeedback, Animated, Easing } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { fetchEventById } from "../../Slices/EventsSlice";
import { fetchPromotionById } from "../../Slices/PromotionsSlice";
import { useDispatch } from "react-redux";
import { logEngagementIfNeeded, getEngagementTarget } from "../../Slices/EngagementSlice";
import EventDropdown from './EventDropdown';
import PromoDropdown from './PromoDropdown';

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

  //console.log(activity)

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
        {/* Events */}
        <EventDropdown
          events={events}
          show={showEvents}
          onToggle={() => setShowEvents((s) => !s)}
          onDetails={(event) => handleEventPromoPress(event, "event")}
          scaleAnim={scaleAnim}
        />
        {/* Promotions */}
        <PromoDropdown
          promotions={promotions}
          show={showPromotions}
          onToggle={() => setShowPromotions((s) => !s)}
          onDetails={(promo) => handleEventPromoPress(promo, "promo")}
          scaleAnim={scaleAnim}
        />
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
});