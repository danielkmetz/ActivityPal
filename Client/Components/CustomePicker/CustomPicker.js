import React, { useState, useEffect } from 'react';
import { View, Modal, StyleSheet, Platform, TouchableWithoutFeedback } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Animated from 'react-native-reanimated';
import useSlideDownDismiss from '../../utils/useSlideDown';
import Notch from '../Notch/Notch';
import { GestureDetector } from 'react-native-gesture-handler';

const WheelPicker = ({ selectedValue, onValueChange, options, visible, onClose }) => {
    const [tempValue, setTempValue] = useState(selectedValue);
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

    const handleDone = () => {
        onValueChange(tempValue);
        animateOut();
    };

    useEffect(() => {
        if (visible) {
            animateIn();
        } else {
            (async () => {
                await handleDone();
            })();
        }
    }, [visible]);

    if (!visible) return;

    return (
        <Modal visible={visible} transparent >
            <TouchableWithoutFeedback onPress={handleDone}>
                <View style={styles.overlay}>
                    <GestureDetector gesture={gesture}>
                        <Animated.View style={[styles.sheet, animatedStyle]}>
                            <TouchableWithoutFeedback onPress={() => { }}>
                                <View>
                                    <Notch />
                                    
                                    <Picker
                                        selectedValue={tempValue}
                                        onValueChange={(itemValue) => setTempValue(itemValue)}
                                        style={styles.picker}
                                        itemStyle={styles.pickerItem}
                                    >
                                        {options.map((opt, idx) => (
                                            <Picker.Item key={idx} label={opt.label} value={opt.value} />
                                        ))}
                                    </Picker>
                                </View>
                            </TouchableWithoutFeedback>
                        </Animated.View>
                    </GestureDetector>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

export default WheelPicker;

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        paddingTop: 20,
    },
    header: {
        padding: 16,
        borderBottomColor: '#eee',
        borderBottomWidth: 1,
        alignItems: 'flex-end',
    },
    doneText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#007bff',
    },
    picker: {
        width: '100%',
        backgroundColor: '#f4f4f4',
    },

    pickerItem: {
        fontSize: 22,
        color: '#000',
    },
});
