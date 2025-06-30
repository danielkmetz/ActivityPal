import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function Dropdowns({
    label,
    field,
    value,
    options,
    isExpanded,
    toggleDropdown,
    onChange
}) {
    const displayLabel = (option) => {
        switch (option) {
            case "everyone": return "Everyone";
            case "peopleIFollow": return "People I Follow";
            case "friendsOnly": return "Friends Only";
            case "noTags": return "No Tags";
            case "public": return "Public";
            case "private": return "Private";
            case "none":
                switch (field) {
                    case "messagePermissions": return "No Messaging";
                    case "invites": return "No Invites";
                    case "tagPermissions": return "No Tagging";
                    default: return "None";
                }
            default: return option;
        }
    };

    return (
        <View style={styles.dropdownContainer}>
            <TouchableOpacity
                onPress={() => toggleDropdown(field)}
                style={styles.dropdownHeader}
            >
                <Text style={styles.dropdownLabel}>{label}</Text>
                <MaterialCommunityIcons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={24}
                    color="#555"
                />
            </TouchableOpacity>

            {isExpanded && (
                <View style={styles.dropdownContent}>
                    {options.map((option) => (
                        <TouchableOpacity
                            key={option}
                            style={[
                                styles.optionButton,
                                value === option && styles.optionButtonSelected,
                            ]}
                            onPress={() => {
                                if (option !== value) {
                                    onChange(field, option);
                                }
                            }}
                        >
                            <Text
                                style={[
                                    styles.optionButtonText,
                                    value === option && styles.optionButtonTextSelected,
                                ]}
                            >
                                {displayLabel(option)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
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
    optionButton: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        marginVertical: 5,
        marginHorizontal: 5,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#ccc',
        backgroundColor: '#f8f8f8',
    },
    optionButtonSelected: {
        backgroundColor: '#000',
        borderColor: '#000',
    },
    optionButtonText: {
        fontSize: 15,
        color: '#555',
    },
    optionButtonTextSelected: {
        color: '#fff',
        fontWeight: 'bold',
    },
   
});
