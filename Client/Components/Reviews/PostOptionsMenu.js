import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function PostOptionsMenu({
    isSender,
    dropdownVisible,
    setDropdownVisible,
    handleEdit,
    handleDelete,
    postData, // typically the invite object
}) {
    if (!isSender) return null;

    return (
        <View style={styles.menuWrapper}>
            {dropdownVisible && (
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setDropdownVisible(false)}
                />
            )}
            <TouchableOpacity
                style={styles.menuIcon}
                onPress={() => setDropdownVisible(prev => !prev)}
            >
                <MaterialCommunityIcons name="dots-horizontal" size={24} color="gray" />
            </TouchableOpacity>

            {dropdownVisible && (
                <View style={styles.dropdownMenu}>
                    <TouchableOpacity
                        onPress={() => {
                            setDropdownVisible(false);
                            handleEdit();
                        }}
                    >
                        <Text style={styles.dropdownItem}>✏️ Edit</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        onPress={() => {
                            setDropdownVisible(false);
                            handleDelete(postData);
                        }}
                    >
                        <Text style={styles.dropdownItem}>🗑️ Delete</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    menuWrapper: {
        position: "absolute",
        top: 0,
        right: 5,
        zIndex: 99,
    },
    menuIcon: {
        padding: 4,
    },
    dropdownMenu: {
        position: "absolute",     // <--- this is key
        top: 25,                  // adjust based on icon size
        right: 0,
        backgroundColor: "#fff",
        borderRadius: 5,
        padding: 8,
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        minWidth: 100,
    },
    dropdownItem: {
        fontSize: 16,
        paddingVertical: 6,
    },
    divider: {
        height: 1,
        backgroundColor: "#ccc",
        marginVertical: 6,
    },
});
