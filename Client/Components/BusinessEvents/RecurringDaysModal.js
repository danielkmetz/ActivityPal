import React, { useState, useEffect, useCallback } from "react";
import useSlideDownDismiss from "../../utils/useSlideDown";
import { GestureDetector } from "react-native-gesture-handler";
import Notch from "../Notch/Notch";
import Animated from "react-native-reanimated";
import {
    Modal,
    View,
    Text,
    TouchableWithoutFeedback,
    TouchableOpacity,
    StyleSheet,
    FlatList,
} from "react-native";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const RecurringDaysModal = ({ visible, onClose, selectedDays, onSave, }) => {
    const [days, setDays] = useState(new Set(selectedDays));
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

    useEffect(() => {
        if (visible) {
            animateIn();            // Animate it in
        } else {
            // Animate it out and hide the modal
            (async () => {
                await animateOut();
                onClose();
            })();
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

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.modalOverlay} >
                <TouchableWithoutFeedback onPress={animateOut} >
                    <View style={styles.overlayTouchable}>
                        <GestureDetector
                            gesture={gesture}
                        >
                            <Animated.View
                                style={[styles.modalContent, animatedStyle]}
                            >
                                <Notch />
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
                        </GestureDetector>
                    </View>
                </TouchableWithoutFeedback>
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
