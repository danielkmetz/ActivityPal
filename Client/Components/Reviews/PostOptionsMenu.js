import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";

export default function PostOptionsMenu({
    dropdownVisible,
    setDropdownVisible,
    handleEdit,
    handleDelete,
    postData, // typically the invite object
}) {
    const user = useSelector(selectUser);
    const currentUserId = user?.id;
    const type = String(postData?.type || '').toLowerCase();
    const isSharedPost = (type === 'sharedpost' || type === 'shared' || type === 'sharedpost'); // normalize if needed

    const isSharer = String(postData?.userId) === String(currentUserId); // wrapper author

    if (!(isSharedPost && isSharer)) return null;

    return (
        <View style={styles.menuWrapper}>
            {dropdownVisible && (
                <Pressable
                    style={styles.overlay}
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
                        style={styles.menuItem}
                        onPress={() => {
                            setDropdownVisible(false);
                            handleEdit(postData);
                        }}
                    >
                        <MaterialCommunityIcons
                            name="pencil-outline"
                            size={18}
                            color="#fff"
                            style={styles.icon}
                        />
                        <Text style={styles.dropdownItem}>Edit</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => {
                            setDropdownVisible(false);
                            handleDelete(postData);
                        }}
                    >
                        <Ionicons
                            name="trash-outline"
                            size={18}
                            color="#fff"
                            style={styles.icon}
                        />
                        <Text style={styles.dropdownItem}>Delete</Text>
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
        position: "absolute",
        top: 25,
        right: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        borderRadius: 6,
        padding: 8,
        elevation: 6,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        minWidth: 120,
    },
    dropdownItem: {
        fontSize: 16,
        paddingVertical: 6,
        color: '#fff'
    },
    divider: {
        height: 1,
        backgroundColor: "#ccc",
        marginVertical: 6,
    },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
    },
    icon: {
        marginRight: 8,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
        zIndex: 1,
    },

});
