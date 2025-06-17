import React, { useState, useEffect } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Switch, Alert } from "react-native";
import { fetchPrivacySettings, logout, deleteuserAccount } from "../../Slices/UserSlice";
import { resetBanner, resetLogo, resetProfilePicture, } from "../../Slices/PhotosSlice";
import { useDispatch, useSelector } from "react-redux";
import { resetPlaces, resetEvents, resetBusinessData } from "../../Slices/PlacesSlice";
import { resetFriends } from "../../Slices/friendsSlice";
import { clearGooglePlaces } from "../../Slices/GooglePlacesSlice";
import { resetAllReviews } from "../../Slices/ReviewsSlice";
import { resetNotifications } from "../../Slices/NotificationsSlice";
import { selectPrivacySettings, updatePrivacySettings, selectUser } from "../../Slices/UserSlice";
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function SettingsModal({ visible, onClose }) {
  const dispatch = useDispatch();
  const privacySettings = useSelector(selectPrivacySettings);
  const user = useSelector(selectUser);
  const [slideAnim] = useState(new Animated.Value(500)); // Animation state
  const [isAnimating, setIsAnimating] = useState(false); // Controls modal visibility during animation
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [profileVisibility, setProfileVisibility] = useState(privacySettings.profileVisibility);
  const [deleteDropdownVisible, setDeleteDropdownVisible] = useState(false);
  const userId = user?.id;

  const handleToggleVisibility = async () => {
    const newSetting = profileVisibility === 'public' ? 'private' : 'public';
    setProfileVisibility(newSetting);

    if (userId) {
      await dispatch(updatePrivacySettings({ userId, profileVisibility: newSetting }));
    }
  };

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
    dispatch(resetNotifications());
    dispatch(resetFriends());
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (user?.id) {
              dispatch(deleteUserAccount(user.id));
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (userId) {
      dispatch(fetchPrivacySettings(userId))
    }
  }, [userId, dispatch]);

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

  useEffect(() => {
    if (privacySettings?.profileVisibility) {
      setProfileVisibility(privacySettings.profileVisibility);
    }
  }, [privacySettings]);

  if (!visible && !isAnimating) {
    return null; // Prevent modal from rendering if it's not visible
  }

  return (
    <Modal visible={isAnimating} transparent={true} animationType="none">
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} />
      <Animated.View style={[styles.modalContent, { transform: [{ translateX: slideAnim }] }]}>
        <Text style={styles.modalTitle}>Settings</Text>

        <View style={styles.dropdownContainer}>
          <TouchableOpacity onPress={() => setDropdownVisible(prev => !prev)} style={styles.dropdownHeader}>
            <Text style={styles.dropdownLabel}>Profile Visibility</Text>
            <MaterialCommunityIcons
              name={dropdownVisible ? "chevron-up" : "chevron-down"}
              size={24}
              color="#555"
            />
          </TouchableOpacity>

          {dropdownVisible && (
            <View style={styles.dropdownContent}>
              <View style={styles.toggleRow}>
                <Text style={styles.dropdownValue}>{profileVisibility === 'public' ? 'Public' : 'Private'}</Text>
                <Switch
                  value={profileVisibility === 'private'}
                  onValueChange={handleToggleVisibility}
                />
              </View>
            </View>
          )}

          <View style={styles.dropdownContainer}>
            <TouchableOpacity
              onPress={() => setDeleteDropdownVisible(prev => !prev)}
              style={styles.dropdownHeader}
            >
              <Text style={[styles.dropdownLabel, { color: "#d9534f" }]}>Delete Account</Text>
              <MaterialCommunityIcons
                name={deleteDropdownVisible ? "chevron-up" : "chevron-down"}
                size={24}
                color="#d9534f"
              />
            </TouchableOpacity>

            {deleteDropdownVisible && (
              <View style={styles.dropdownContent}>
                <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
                  <Text style={styles.deleteButtonText}>Delete Account</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

        </View>
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
  dropdownContainer: {
    marginVertical: 20,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  dropdownLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  dropdownValue: {
    fontSize: 16,
    color: '#555',
  },
  dropdownContent: {
    marginTop: 10,
    paddingVertical: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#333',
  },
  deleteButton: {
    backgroundColor: "#d9534f",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
