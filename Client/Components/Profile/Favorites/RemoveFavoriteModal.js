import React, { useEffect, useCallback } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import useSlideDownDismiss from "../../../utils/useSlideDown";
import { removeFavorite } from "../../../Slices/FavoritesSlice";
import { selectUser } from "../../../Slices/UserSlice";
import Notch from "../../Notch/Notch";

export default function RemoveFavoriteModal({
  visible,
  setVisible, // <-- modal controls its own closing
  business,
  title = "Remove from Favorites?",
}) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser, shallowEqual);
  const userId = user?.id || user?._id || null;
  const placeId = business?.placeId || "";

  const requestClose = useCallback(() => {
    setVisible?.(false);
  }, [setVisible]);

  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(requestClose);

  useEffect(() => {
    if (visible) {
      animateIn();
    } else {
      (async () => {
        await animateOut();
      })();
    }
  }, [visible]);

  const handleRemove = useCallback(() => {
    if (!userId || !placeId) return;

    try {
      dispatch(removeFavorite({ userId, placeId }));
    } finally {
      // slide down first, then requestClose() runs after animation completes
      animateOut();
    }
  }, [dispatch, userId, placeId, animateOut]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent onRequestClose={animateOut}>
      <TouchableWithoutFeedback onPress={animateOut}>
        <View style={styles.overlay}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.sheet, animatedStyle]}>
              {/* swallow touches so taps inside don’t dismiss */}
              <TouchableWithoutFeedback onPress={() => { }}>
                <View>
                  <Notch />
                  <Text style={styles.title}>{title}</Text>
                  <TouchableOpacity
                    onPress={handleRemove}
                    style={styles.rowButton}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name="delete-outline"
                      size={20}
                      color="red"
                    />
                    <Text style={styles.rowTextRed}>Remove</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={animateOut}
                    style={styles.cancelButton}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </Animated.View>
          </GestureDetector>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: "#333",
    textAlign: "center",
  },
  rowButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    justifyContent: "center",
  },
  rowTextRed: {
    fontSize: 16,
    marginLeft: 10,
    color: "red",
  },
  cancelButton: {
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#007bff",
  },
});
