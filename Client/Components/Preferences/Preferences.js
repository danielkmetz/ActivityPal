// PreferencesModal.js
import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { selectCoordinates, selectLocation } from '../../Slices/LocationSlice';
import { useSelector, useDispatch } from 'react-redux';
import { milesToMeters } from '../../functions';
import { fetchNearbyPlaces, resetPlaces, resetEvents, fetchEvents } from '../../Slices/PlacesSlice';
import { 
    setDistance, 
    setBudget, 
    setGroupSize, 
    setIsFamilyFriendly,
    selectDistance,
    selectBudget,
    selectGroupSize,
    selectFamilyFriendly,
    selectEventType,
    setEventType, 
} from '../../Slices/PreferencesSlice';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import RNPickerSelect from 'react-native-picker-select';

const PreferencesModal = ({ visible, onClose }) => {
    const dispatch = useDispatch();
    const distance = useSelector(selectDistance);
    const budget = useSelector(selectBudget);
    const eventType = useSelector(selectEventType);
    const isFamilyFriendly = useSelector(selectFamilyFriendly);
    const coordinates = useSelector(selectCoordinates);
    const navigation = useNavigation();

    const lat = coordinates?.lat;
    const lng = coordinates?.lng;
    const radius = milesToMeters(distance);
    
    const handleSubmit = () => {
        if (lat && lng && radius && budget && eventType) {
            if (eventType === "Dining" || eventType === "Entertainment" || eventType === "Outdoor" || eventType === "Indoor") {
                dispatch(resetPlaces());
                dispatch(fetchNearbyPlaces({lat, lng, radius, budget, activityType: eventType}));
            } else {
                dispatch(resetEvents());
                dispatch(fetchEvents({lat, lng, radius: distance}));
            }
            onClose();
            navigation.navigate('TabNavigator', { screen: 'Activities' })
        };
    };

    const handleEventTypeChange = (value) => {
        dispatch(setEventType(value));
    };    

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                {coordinates ? (
                    <View style={styles.modalContainer}>
                        {/* X Close Button */}
                        <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
                            <Text style={styles.closeIconText}>✕</Text>
                        </TouchableOpacity>
    
                        <Text style={styles.modalTitle}>Customize Your Vibe</Text>
    
                        {/* Distance Slider */}
                        <Text style={styles.optionLabel}>Distance (miles): {distance}</Text>
                        <Slider
                            style={styles.slider}
                            minimumValue={1}
                            maximumValue={50}
                            step={1}
                            value={distance}
                            onValueChange={value => dispatch(setDistance(value))}
                            minimumTrackTintColor="#2196F3"
                            maximumTrackTintColor="#ddd"
                            thumbTintColor="#2196F3"
                        />
    
                        {/* Budget */}
                        <Text style={styles.optionLabel}>Budget:</Text>
                        <View style={styles.buttonGroup}>
                            {['$', '$$', '$$$', '$$$$'].map(b => (
                                <TouchableOpacity
                                    key={b}
                                    style={[styles.budgetButton, budget === b && styles.selectedButton]}
                                    onPress={() => dispatch(setBudget(b))}
                                >
                                    <Text style={styles.buttonText}>{b}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
    
                        {/* Family Friendly */}
                        <View style={styles.switchContainer}>
                            <Text style={styles.optionLabel}>Family Friendly</Text>
                            <Switch
                                value={isFamilyFriendly}
                                onValueChange={value => dispatch(setIsFamilyFriendly(value))}
                                trackColor={{ false: "#ccc", true: "#2196F3" }}
                                thumbColor={isFamilyFriendly ? "#2196F3" : "#f4f3f4"}
                            />
                        </View>

                        {/* Event Type Picker */}
                        <View style={styles.inlineContainer}>
                            <Text style={styles.optionLabel}>Activity Type:</Text>
                            <View style={styles.pickerContainer}>
                                <RNPickerSelect
                                    onValueChange={handleEventTypeChange}
                                    items={[
                                        { label: 'Outdoor', value: 'Outdoor' },
                                        { label: 'Indoor', value: 'Indoor' },
                                        { label: 'Dining', value: 'Dining' },
                                        { label: 'Event', value: 'Event' },
                                        { label: 'Entertainment', value: 'Entertainment' },
                                    ]}
                                    value={eventType}
                                    placeholder={{ label: "Select Activity Type", value: null }}
                                    style={pickerSelectStyles}
                                    
                                />
                            </View>
                        </View>
    
    
                        {/* Submit Button */}
                        <TouchableOpacity onPress={handleSubmit} style={styles.submitButton}>
                            <Text style={styles.submitButtonText}>Submit</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0000ff" />
                    </View>
                )}
            </View>
        </Modal>
    );
    
};

export default PreferencesModal;

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContainer: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
        elevation: 10,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 15,
        textAlign: 'center',
    },
    closeIcon: {
        //position: 'absolute',
        top: 15,
        right: 15,
        padding: 5,
        zIndex: 1,
    },
    closeIconText: {
        fontSize: 20,
        color: '#333',
    },
    optionLabel: {
        fontSize: 16,
        marginVertical: 10,
    },
    slider: {
        width: '100%',
        height: 50,
    },
    buttonGroup: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginVertical: 10,
    },
    budgetButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: '#ccc',
    },
    selectedButton: {
        backgroundColor: '#ddd',
    },
    buttonText: {
        fontSize: 14,
    },
    switchContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 10,
    },
    submitButton: {
        backgroundColor: '#2196F3',
        padding: 10,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 15,
    },
    submitButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    inlineContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 10,
    },
    pickerContainer: {
        flex: 1,
        marginLeft: 10, // Spacing between label and picker
        zIndex: 1000,
    },
});

const pickerSelectStyles = StyleSheet.create({
    inputIOS: {
        fontSize: 16,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'gray',
        borderRadius: 4,
        color: 'black',
        paddingRight: 30,
        marginVertical: 40,
        
        zIndex: 1000,
    },
    
});

