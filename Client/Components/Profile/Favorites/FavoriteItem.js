import React, { useMemo, useCallback } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions } from "react-native";
import businessPlaceholder from '../../../assets/pics/business-placeholder.png' 

const SCREEN_WIDTH = Dimensions.get("window").width;

function FavoriteItem({ business, onPress }) {
  const imageSource = useMemo(() => {
    return businessPlaceholder
  }, [business?.profilePicUrl]);

  const handlePress = useCallback(() => {
    onPress?.(business);
  }, [onPress, business]);

  return (
    <TouchableOpacity style={styles.businessCard} onPress={handlePress} activeOpacity={0.8}>
      <Image source={imageSource} style={styles.businessImage} fadeDuration={0} />
      <View style={styles.textContainer}>
        <Text style={styles.businessName} numberOfLines={1}>
          {business?.businessName || "Business"}
        </Text>
        <Text style={styles.location} numberOfLines={2}>
          {business?.location?.formattedAddress || ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(FavoriteItem);

const styles = StyleSheet.create({
  businessCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: SCREEN_WIDTH * 0.95,
    alignSelf: "center",
    marginBottom: 10,
  },
  businessImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 10,
  },
  textContainer: { flex: 1 },
  businessName: { fontSize: 16, fontWeight: "bold" },
  location: { fontSize: 14, color: "gray" },
});
