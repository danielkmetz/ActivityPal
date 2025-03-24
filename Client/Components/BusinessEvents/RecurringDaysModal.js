import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    Animated,
    PanResponder,
    Dimensions,
} from "react-native";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const { height } = Dimensions.get("window"); // Get screen height

const RecurringDaysModal = ({ visible, onClose, selectedDays, onSave, }) => {
    const [days, setDays] = useState(new Set(selectedDays));
    const slideAnim = useRef(new Animated.Value(height)).current; // Start off-screen

    useEffect(() => {
        if (visible) {
            Animated.timing(slideAnim, {
                toValue: 0, // Slide to view
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: height, // Move fully off-screen
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    }, [visible]);

    const toggleDay = useCallback((day) => {
        setDays((prevDays) => {
            const newDays = new Set(prevDays);
            if (newDays.has(day)) {
                newDays.delete(day);
            } else {
                newDays.add(day);
            }
            return newDays.size === 0 ? new Set() : newDays; // Ensure state resets when empty
        });
    }, []);

    // Gesture handling for swipe down
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    slideAnim.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 100) {
                    Animated.timing(slideAnim, {
                        toValue: height, // Move it completely off-screen
                        duration: 300,
                        useNativeDriver: true,
                    }).start(() => onClose());
                } else {
                    Animated.timing(slideAnim, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.modalOverlay}>
                <TouchableOpacity style={styles.overlayTouchable} onPress={onClose} />
                <Animated.View
                    style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}
                    {...panResponder.panHandlers}
                >
                    <View style={styles.notch} />
                    <Text style={styles.title}>Select Recurring Days</Text>

                    <FlatList
                        data={daysOfWeek}
                        keyExtractor={(item) => item}
                        extraData={days}
                        renderItem={({ item }) => {
                            const isSelected = days.has(item);
                            return (
                                <TouchableOpacity style={styles.item} onPress={() => toggleDay(item)}>
                                    <Text style={styles.text}>{item}</Text>
                                    <Text style={styles.checkbox}>{isSelected ? "✔" : "○"}</Text>
                                </TouchableOpacity>
                            );
                        }}
                    />

                    <TouchableOpacity style={styles.saveButton} onPress={() => onSave([...days])}>
                        <Text style={styles.saveButtonText}>Save</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
};

export default RecurringDaysModal;

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    overlayTouchable: {
        flex: 1,
    },
    modalContent: {
        width: "100%",
        backgroundColor: "white",
        padding: 20,
        borderTopLeftRadius: 15,
        borderTopRightRadius: 15,
        alignItems: "center",
        position: "absolute",
        bottom: 0,
        height: "53%",
    },
    notch: {
        width: 40,
        height: 5,
        backgroundColor: "#ccc",
        borderRadius: 3,
        marginBottom: 10,
    },
    title: {
        fontSize: 18,
        fontWeight: "bold",
        marginBottom: 10,
    },
    item: {
        flexDirection: "row",
        justifyContent: "space-between",
        padding: 10,
        width: "100%",
    },
    text: {
        fontSize: 16,
    },
    checkbox: {
        fontSize: 18,
    },
    saveButton: {
        backgroundColor: "#2196F3",
        padding: 10,
        borderRadius: 5,
        marginTop: 10,
        width: "100%",
        alignItems: "center",
        marginBottom: 15,
    },
    saveButtonText: {
        color: "white",
        fontWeight: "bold",
    },
});
