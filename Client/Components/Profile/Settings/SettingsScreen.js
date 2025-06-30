import React, { useState, useEffect } from "react";
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
import {
    resetBanner,
    resetLogo,
    resetProfilePicture,
} from "../../../Slices/PhotosSlice";
import {
    resetPlaces,
    resetEvents,
    resetBusinessData,
} from "../../../Slices/PlacesSlice";
import { resetFriends } from "../../../Slices/friendsSlice";
import { clearGooglePlaces } from "../../../Slices/GooglePlacesSlice";
import { resetAllReviews } from "../../../Slices/ReviewsSlice";
import { resetNotifications } from "../../../Slices/NotificationsSlice";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import Dropdowns from './Dropdowns'

export default function SettingsScreen() {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const privacySettings = useSelector(selectPrivacySettings);
    const user = useSelector(selectUser);
    const [darkMode, setDarkMode] = useState(false); // Local toggle state
    const userId = user?.id;

    const settingsConfig = [
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
    ];

    const [dropdowns, setDropdowns] = useState({
        profile: false,
        message: false,
        invites: false,
        tags: false,
        delete: false,
    });

    const [settings, setSettings] = useState({
        profileVisibility: "public",
        messagePermissions: "everyone",
        invites: "friendsOnly",
        tagPermissions: "everyone",
    });

    useEffect(() => {
        if (userId) {
            dispatch(fetchPrivacySettings(userId));
        }
    }, [userId]);

    useEffect(() => {
        if (privacySettings) {
            setSettings({
                profileVisibility: privacySettings.profileVisibility || "public",
                messagePermissions: privacySettings.messagePermissions || "everyone",
                invites: privacySettings.invites || "friendsOnly",
                tagPermissions: privacySettings.tagPermissions || "everyone",
            });
        }
    }, [privacySettings]);

    const toggleDropdown = (key) => {
        setDropdowns((prev) => ({ ...prev, [key]: !prev[key] }));
    };

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
                        if (user?.id) {
                            dispatch(deleteUserAccount(user.id));
                        }
                    },
                },
            ]
        );
    };

    const toggleDarkMode = () => {
        setDarkMode(prev => !prev);
    };

    const handleResetPassword = () => {
        console.log("Password reset pressed");
    }

    return (
        <ScrollView style={styles.container}>
            {settingsConfig.map(({ label, field, options }) => (
                <Dropdowns
                    key={field}
                    label={label}
                    field={field}
                    value={settings[field]}
                    options={options}
                    isExpanded={dropdowns[field]}
                    toggleDropdown={toggleDropdown}
                    onChange={(field, selected) => {
                        const updated = { ...settings, [field]: selected };
                        setSettings(updated);
                        dispatch(updateAnyPrivacySettings({ userId, updates: { [field]: selected } }));
                    }}
                />
            ))}
            {/* Delete Account */}
            <View style={styles.dropdownContainer}>
                <TouchableOpacity
                    onPress={() => toggleDropdown("delete")}
                    style={styles.dropdownHeader}
                >
                    <Text style={[styles.dropdownLabel, { color: "#d9534f" }]}>Delete Account</Text>
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
             {/* Render once at the end */}
            <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Dark Mode</Text>
                <Switch
                    value={darkMode}
                    onValueChange={toggleDarkMode}
                    thumbColor={darkMode ? '#000' : '#ccc'}
                    trackColor={{ false: '#ccc', true: '#888' }}
                />
            </View>
            <TouchableOpacity style={styles.resetButton} onPress={handleResetPassword}>
                <Text style={styles.resetButtonText}>Reset Password</Text>
            </TouchableOpacity>
            {/* Actions */}
            <View style={styles.buttonContainer}>
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutButtonText}>Logout</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
        padding: 20,
        marginTop: 120,
    },
    dropdownContainer: {
        marginVertical: 15,
    },
    dropdownHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: "#ccc",
    },
    dropdownLabel: {
        fontSize: 16,
        fontWeight: "600",
    },
    dropdownContent: {
        marginTop: 10,
        paddingVertical: 10,
    },
    deleteButton: {
        backgroundColor: "#d9534f",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 5,
        alignItems: "center",
    },
    deleteButtonText: {
        color: "white",
        fontSize: 16,
        fontWeight: "bold",
    },
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
     toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 10,
        marginTop: 20,
    },
    toggleLabel: {
        fontSize: 16,
    },
    resetButton: {
        marginTop: 15,
        marginHorizontal: 10,
        paddingVertical: 10,
        backgroundColor: '#d32f2f',
        borderRadius: 6,
    },
    resetButtonText: {
        color: '#fff',
        textAlign: 'center',
        fontWeight: '600',
    },
});
