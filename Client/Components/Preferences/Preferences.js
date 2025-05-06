import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    Switch,
    ActivityIndicator,
    TouchableWithoutFeedback,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { selectCoordinates, selectLocation } from '../../Slices/LocationSlice';
import { useSelector, useDispatch } from 'react-redux';
import { milesToMeters } from '../../functions';
import {
    setDistance,
    setBudget,
    setIsFamilyFriendly,
    selectDistance,
    selectBudget,
    selectFamilyFriendly,
    selectEventType,
    setEventType,
} from '../../Slices/PreferencesSlice';
import { GestureDetector } from 'react-native-gesture-handler';
import Slider from '@react-native-community/slider';
import WheelPicker from '../CustomePicker/CustomPicker';
import useSlideDownDismiss from '../../utils/useSlideDown';
import Notch from '../Notch/Notch';

const PreferencesModal = ({ visible, onClose, onSubmitCustomSearch }) => {
    const dispatch = useDispatch();
    const distance = useSelector(selectDistance);
    const budget = useSelector(selectBudget);
    const eventType = useSelector(selectEventType);
    const isFamilyFriendly = useSelector(selectFamilyFriendly);
    const coordinates = useSelector(selectCoordinates);
    const [showPicker, setShowPicker] = useState(false);
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

    const lat = coordinates?.lat;
    const lng = coordinates?.lng;
    const radius = milesToMeters(distance);

    useEffect(() => {
        if (visible) {
            animateIn();
        } else {
            (async () => {
                await animateOut();
                onClose();
            })();
        }
    }, [visible]);

    const handleSubmit = () => {
        if (lat && lng && radius && budget && eventType) {
            onSubmitCustomSearch(eventType, {
                radius,
                budget,
            });
            onClose();
        }
    };

    const handleEventTypeChange = (value) => {
        dispatch(setEventType(value));
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
        >
            <TouchableWithoutFeedback onPress={animateOut}>
                <View style={styles.modalOverlay}>
                    <GestureDetector
                        gesture={gesture}
                    >
                        <Animated.View style={[styles.modalContainer, animatedStyle]}>
                            <Notch />
                            {coordinates ? (
                                <View style={styles.modalContainer}>
                                    <Text style={styles.modalTitle}>Customize Your Vybe</Text>
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
                                    {eventType === 'Dining' && (
                                        <>
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
                                        </>
                                    )}
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
                                    <TouchableOpacity style={styles.pickerButton} onPress={() => setShowPicker(true)}>
                                        <Text style={eventType ? styles.selectedText : styles.placeholderText}>
                                            {eventType || 'Select Activity Type'}
                                        </Text>
                                    </TouchableOpacity>
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
                        </Animated.View>
                    </GestureDetector>
                </View>
            </TouchableWithoutFeedback>
            <WheelPicker
                visible={showPicker}
                onClose={() => setShowPicker(false)}
                selectedValue={eventType}
                onValueChange={handleEventTypeChange}
                options={[
                    { label: 'Outdoor', value: 'Outdoor' },
                    { label: 'Indoor', value: 'Indoor' },
                    { label: 'Dining', value: 'Dining' },
                    { label: 'Event', value: 'Event' },
                    { label: 'Entertainment', value: 'Entertainment' },
                ]}
            />
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
    pickerButton: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: '#fff',
        marginTop: 10,
    },
    placeholderText: {
        color: '#999',
    },
    selectedText: {
        color: '#000',
    },

});