import React, { useCallback, useMemo, useState } from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { selectUser } from "../../../Slices/UserSlice";
import { selectFavorites, addFavorite } from "../../../Slices/FavoritesSlice";
import RemoveFavoriteModal from "./RemoveFavoriteModal";

export default function FavoriteButton({ business, style, textStyle }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser, shallowEqual);
  const favorites = useSelector(selectFavorites) || [];
  const userId = user?.id || user?._id || null;
  const placeId = business?.placeId || "";
  const [confirmVisible, setConfirmVisible] = useState(false);
  const isFavorited = useMemo(() => {
    if (!placeId) return false;
    return (favorites || []).includes(placeId);
  }, [favorites, placeId]);

  const handlePress = useCallback(() => {
    if (!userId || !placeId) return;

    if (isFavorited) {
      setConfirmVisible(true);
      return;
    }

    dispatch(addFavorite({ userId, placeId }));
  }, [dispatch, userId, placeId, isFavorited]);

  return (
    <>
      <TouchableOpacity
        style={[styles.button, isFavorited && styles.isFavorited, style]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Ionicons name="star" size={20} color="white" />
        <Text style={[styles.text, textStyle]}>
          {isFavorited ? "Favorited" : "Favorite"}
        </Text>
      </TouchableOpacity>

      <RemoveFavoriteModal
        visible={confirmVisible}
        setVisible={setConfirmVisible}
        business={business}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "teal",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginRight: 5,
    height: 35,
  },
  isFavorited: { backgroundColor: "gray" },
  text: { color: "white", marginLeft: 5, fontWeight: "bold" },
});
