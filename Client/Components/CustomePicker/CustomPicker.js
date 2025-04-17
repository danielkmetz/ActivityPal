import React, { useState } from 'react';
import {
    View,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    Platform,
    TouchableWithoutFeedback,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

const WheelPicker = ({ selectedValue, onValueChange, options, visible, onClose }) => {
    const [tempValue, setTempValue] = useState(selectedValue);

    const handleDone = () => {
        onValueChange(tempValue);
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <TouchableWithoutFeedback onPress={handleDone}>
            <View style={styles.overlay}>
                <TouchableWithoutFeedback>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleDone}>
                            <Text style={styles.doneText}>Done</Text>
                        </TouchableOpacity>
                    </View>
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
