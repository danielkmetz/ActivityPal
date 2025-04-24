import React, { useState, useEffect } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { logout } from "../../Slices/UserSlice";
import { resetBanner, resetLogo, resetProfilePicture, } from "../../Slices/PhotosSlice";
import { useDispatch } from "react-redux";
import { resetPlaces, resetEvents, resetBusinessData } from "../../Slices/PlacesSlice";
import { clearGooglePlaces } from "../../Slices/GooglePlacesSlice";
import { resetAllReviews } from "../../Slices/ReviewsSlice";

export default function SettingsModal({ visible, onClose }) {
    const dispatch = useDispatch();
    const [slideAnim] = useState(new Animated.Value(500)); // Animation state
    const [isAnimating, setIsAnimating] = useState(false); // Controls modal visibility during animation

    const handleLogout = () => {
        dispatch(logout())
        dispatch(resetProfilePicture());
        dispatch(resetLogo());
        dispatch(resetBanner());
        dispatch(resetPlaces());
        dispatch(resetEvents());
        dispatch(resetBusinessData());
        dispatch(clearGooglePlaces());
        dispatch(resetAllReviews());
    }

    const onEditProfile = () => {

    };

    useEffect(() => {
        if (visible) {
        // Ensure animation starts from the right
        setIsAnimating(true);
        Animated.timing(slideAnim, {
            toValue: 0, // Slide in
            duration: 300,
            useNativeDriver: true,
        }).start();
        } else if (isAnimating) {
        // Slide out and close modal after animation
        Animated.timing(slideAnim, {
            toValue: 500, // Slide off-screen
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            setIsAnimating(false); // Ensure modal is hidden after animation
        });
        }
    }, [visible]);

    if (!visible && !isAnimating) {
        return null; // Prevent modal from rendering if it's not visible
    }

    return (
        <Modal visible={isAnimating} transparent={true} animationType="none">
        <TouchableOpacity style={styles.modalOverlay} onPress={onClose} />
        <Animated.View style={[styles.modalContent, { transform: [{ translateX: slideAnim }] }]}>
            <Text style={styles.modalTitle}>Settings</Text>
            {/* Buttons at the bottom */}
            <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            </View>
        </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: "70%",
    backgroundColor: "#fff",
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 50,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
  },
  logoutButton: {
    backgroundColor: "black",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  logoutButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  cancelButtonText: {
    color: "black",
    fontSize: 16,
  },
});
