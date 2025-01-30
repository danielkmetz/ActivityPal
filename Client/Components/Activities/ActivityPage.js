import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Preferences from '../Preferences/Preferences';
import { selectEvents, selectPlaces } from '../../Slices/PlacesSlice';
import Activities from './Activities';
import Events from './Events';
import { useSelector } from 'react-redux';
import { selectEventType } from '../../Slices/PreferencesSlice';

const ActivityPage = () => {
    const [modalVisible, setModalVisible] = useState(false);
    const activities = useSelector(selectPlaces);
    const events = useSelector(selectEvents);
    const eventType = useSelector(selectEventType);

    // Determine data and loading state based on eventType
    const data = eventType !== "Event" ? activities : events;
    const isLoading = data?.length === 0;

    const handleOpenPreferences = () => {
        setModalVisible(true);
    };

    return (
        <View style={styles.container}>
            {/* Preferences Modal */}
            <Preferences
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
            />

            <Text style={styles.title}>Nearby Activities</Text>

            {isLoading ? (
                <Text style={styles.placeholderText}>
                    Customize your preferences to get suggestions
                </Text>
            ) : (
                <FlatList
                    data={data}
                    keyExtractor={(item) => item.id || item.reference || String(Math.random())}
                    renderItem={({ item }) =>
                        eventType !== "Event" ? (
                            <Activities activity={item} />
                        ) : (
                            <Events event={item} />
                        )
                    }
                    contentContainerStyle={styles.list}
                />
            )}

            {/* Floating Change Preferences Button */}
            <TouchableOpacity
                onPress={handleOpenPreferences}
                style={styles.floatingButton}
            >
                <Text style={styles.floatingButtonText}>Preferences</Text>
            </TouchableOpacity>
        </View>
    );
};

export default ActivityPage;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f5f5f5',
        marginTop: 120,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginVertical: 10,
    },
    list: {
        paddingBottom: 20,
    },
    placeholderText: {
        textAlign: 'center',
        fontSize: 16,
        color: '#888',
        marginTop: 20,
    },
    floatingButton: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        backgroundColor: '#2196F3',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
        elevation: 5, // Adds shadow on Android
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2, // Adds shadow on iOS
    },
    floatingButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
