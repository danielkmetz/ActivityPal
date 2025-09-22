import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import RatingsBreakdownModal from "../metricRatings/RatingsBreakdownModal";
import { selection } from "../../../utils/Haptics/haptics";

export default function RatingsButton({
  rating = 0,
  ratings = {
    rating: 0,
    priceRating: 0,
    serviceRating: 0,
    atmosphereRating: 0,
    wouldRecommend: false,
  },
  style,
}) {
  const [open, setOpen] = useState(false);

  const onPress = () => {
    selection();
    setOpen(true);
  };

  const safeRating = Number.isFinite(rating) ? Math.max(0, Math.floor(rating)) : 0;

  return (
    <>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={style}>
        <View style={styles.ratingButton}>
          <View style={styles.ratingStars}>
            {Array.from({ length: safeRating }).map((_, i) => (
              <MaterialCommunityIcons key={i} name="star" size={18} color="gold" />
            ))}
          </View>
        </View>
      </TouchableOpacity>

      <RatingsBreakdownModal
        visible={open}
        onClose={() => setOpen(false)}
        ratings={ratings}
      />
    </>
  );
}

const styles = StyleSheet.create({
  ratingButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#bfbfbf",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 2,
    elevation: 2, // Android
    shadowColor: "#000", // iOS
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    marginTop: 6,
    marginBottom: 4,
  },
  ratingStars: {
    flexDirection: "row",
  },
});
