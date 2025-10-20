import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchPrivacySettings,
  logout,
  deleteUserAccount,
  updateAnyPrivacySettings,
  selectPrivacySettings,
  selectUser,
} from "../../../Slices/UserSlice";
import { resetBanner, resetLogo, resetProfilePicture } from "../../../Slices/PhotosSlice";
import { resetPlaces, resetEvents, resetBusinessData } from "../../../Slices/PlacesSlice";
import { resetFriends } from "../../../Slices/friendsSlice";
import { clearGooglePlaces } from "../../../Slices/GooglePlacesSlice";
import { resetAllReviews } from "../../../Slices/ReviewsSlice";
import { resetNotifications } from "../../../Slices/NotificationsSlice";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import Dropdowns from "./Dropdowns";

export default function SettingsScreen() {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const privacySettings = useSelector(selectPrivacySettings);
  const user = useSelector(selectUser);
  const userId = user?.id;
  const [darkMode, setDarkMode] = useState(false);
  const [dropdowns, setDropdowns] = useState({
    privacyPermissions: false, // controls the entire permissions section
    profileVisibility: false,
    messagePermissions: false,
    invites: false,
    tagPermissions: false,
    delete: false,
  });

  const settingsConfig = useMemo(
    () => [
      {
        label: "Profile Visibility",
        field: "profileVisibility",
        options: ["public", "private"],
      },
      {
        label: "Message Permissions",
        field: "messagePermissions",
        options: ["everyone", "peopleIFollow", "none"],
      },
      {
        label: "Invite Permissions",
        field: "invites",
        options: ["everyone", "peopleIFollow", "none"],
      },
      {
        label: "Tag Permissions",
        field: "tagPermissions",
        options: ["everyone", "peopleIFollow", "none"],
      },
    ],
    []
  );

  const [settings, setSettings] = useState({
    profileVisibility: "public",
    messagePermissions: "everyone",
    invites: "peopleIFollow",
    tagPermissions: "everyone",
  });

  // Fetch privacy settings
  useEffect(() => {
    if (userId) dispatch(fetchPrivacySettings(userId));
  }, [userId, dispatch]);

  // Apply privacy settings to local state
  useEffect(() => {
    if (privacySettings) {
      setSettings({
        profileVisibility: privacySettings.profileVisibility || "public",
        messagePermissions: privacySettings.messagePermissions || "everyone",
        invites: privacySettings.invites || "peopleIFollow",
        tagPermissions: privacySettings.tagPermissions || "everyone",
      });
    }
  }, [privacySettings]);

  const toggle = (key) =>
    setDropdowns((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleLogout = () => {
    dispatch(logout());
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
    navigation.goBack();
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
            if (user?.id) dispatch(deleteUserAccount(user.id));
          },
        },
      ]
    );
  };

  const toggleDarkMode = () => setDarkMode((prev) => !prev);
  const handleResetPassword = () => {
    console.log("Password reset pressed");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} >
      {/* Privacy Permissions (single accordion) */}
      <View style={styles.dropdownContainer}>
        <TouchableOpacity
          onPress={() => toggle("privacyPermissions")}
          style={styles.dropdownHeader}
        >
          <Text style={styles.dropdownLabel}>Privacy Permissions</Text>
          <MaterialCommunityIcons
            name={dropdowns.privacyPermissions ? "chevron-up" : "chevron-down"}
            size={24}
            color="#000"
          />
        </TouchableOpacity>
        {dropdowns.privacyPermissions && (
          <View style={styles.dropdownContent}>
            {settingsConfig.map(({ label, field, options }) => (
              <Dropdowns
                key={field}
                label={label}
                field={field}
                value={settings[field]}
                options={options}
                isExpanded={dropdowns[field]}
                toggleDropdown={() => toggle(field)}
                onChange={(fieldName, selected) => {
                  const updated = { ...settings, [fieldName]: selected };
                  setSettings(updated);
                  dispatch(
                    updateAnyPrivacySettings({
                      userId,
                      updates: { [fieldName]: selected },
                    })
                  );
                }}
              />
            ))}
          </View>
        )}
      </View>
      {/* Hidden Posts nav row */}
      <TouchableOpacity
        style={styles.navRow}
        onPress={() => navigation.navigate("HiddenPosts")}
        accessibilityRole="button"
        accessibilityLabel="Hidden Posts"
      >
        <View>
          <Text style={styles.navTitle}>Hidden Posts</Text>
          <Text style={styles.navSubtitle}>
            View and unhide posts you’ve hidden from your profile
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={28} color="#000" />
      </TouchableOpacity>
      {/* Delete Account */}
      <View style={styles.dropdownContainer}>
        <TouchableOpacity
          onPress={() => toggle("delete")}
          style={styles.dropdownHeader}
        >
          <Text style={[styles.dropdownLabel, { color: "#d9534f" }]}>
            Delete Account
          </Text>
          <MaterialCommunityIcons
            name={dropdowns.delete ? "chevron-up" : "chevron-down"}
            size={24}
            color="#d9534f"
          />
        </TouchableOpacity>
        {dropdowns.delete && (
          <View style={styles.dropdownContent}>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
              <Text style={styles.deleteButtonText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {/* General toggles/actions */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Dark Mode</Text>
        <Switch
          value={darkMode}
          onValueChange={toggleDarkMode}
          thumbColor={darkMode ? "#000" : "#ccc"}
          trackColor={{ false: "#ccc", true: "#888" }}
        />
      </View>
      <View style={styles.footer}>
      <TouchableOpacity style={styles.resetButton} onPress={handleResetPassword}>
        <Text style={styles.resetButtonText}>Reset Password</Text>
      </TouchableOpacity>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 120, // keep your original top spacing
  },

  // Accordion blocks
  dropdownContainer: { marginVertical: 15 },
  dropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#ccc",
  },
  dropdownLabel: { fontSize: 16, fontWeight: "600" },
  dropdownContent: { marginTop: 10, paddingVertical: 10 },
   footer: {
    marginTop: "auto",      // <-- magic line
    paddingTop: 16,
  },

  // Hidden Posts nav row
  navRow: {
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#f7f7f7",
    borderWidth: 1,
    borderColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navTitle: { fontSize: 16, fontWeight: "700" },
  navSubtitle: { fontSize: 12, color: "#666", marginTop: 2 },

  // Delete button
  deleteButton: {
    backgroundColor: "#d9534f",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: "center",
  },
  deleteButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },

  // Actions
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 30,
  },
  logoutButton: {
    backgroundColor: "black",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  logoutButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
  cancelButton: {
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  cancelButtonText: { color: "black", fontSize: 16 },

  // Misc
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    marginTop: 20,
  },
  toggleLabel: { fontSize: 16 },
  resetButton: {
    marginTop: 15,
    marginHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#d32f2f",
    borderRadius: 6,
  },
  resetButtonText: { color: "#fff", textAlign: "center", fontWeight: "600" },
});
