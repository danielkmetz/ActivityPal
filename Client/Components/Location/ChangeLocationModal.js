import React, { useEffect, useState } from 'react';
import {
    Modal,
    Text,
    StyleSheet,
    TouchableWithoutFeedback,
    Keyboard,
    Alert,
    KeyboardAvoidingView,
    Platform,
    View,
} from 'react-native';
import Animated, {
    useSharedValue,
    withTiming,
    useAnimatedStyle,
} from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSelector, useDispatch } from 'react-redux';
import {
    selectCoordinates,
    geocodeAddressThunk,
    reverseGeocodeThunk,
    selectReverseGeocodeAddress,
    selectManualCoordinates,
    selectLocationModalVisible,
    closeLocationModal,
    setManualCoordinates,
} from '../../Slices/LocationSlice';
import Notch from '../Notch/Notch';
import useSlideDownDismiss from '../../utils/useSlideDown';
import Autocomplete from './Autocomplete';

const ChangeLocationModal = () => {
    const dispatch = useDispatch();
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const visible = useSelector(selectLocationModalVisible);
    const coordinates = useSelector(selectCoordinates);
    const fadeAnim = useSharedValue(0);
    const onClose = () => {
        dispatch(closeLocationModal());
    };
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
    
    useEffect(() => {
        fadeAnim.value = withTiming(visible ? 1 : 0, { duration: 100 });

        if (visible) {
            animateIn();
            // dispatch(reverseGeocodeThunk(coordinates))
            //     .unwrap()
            //     .then(setAddress)
            //     .catch((err) => console.warn('Reverse geocode failed:', err));
        } else {
            (async () => {
                await animateOut();
                onClose();
            })();
        }
    }, [visible]);

    const fadeStyle = useAnimatedStyle(() => ({
        opacity: fadeAnim.value,
    }));

    const handleSubmit = async () => {
        if (!address.trim()) return;

        setLoading(true);
        try {
            const resultAction = await dispatch(geocodeAddressThunk(address));
            
            if (geocodeAddressThunk.fulfilled.match(resultAction)) {
                setAddress('');
                animateOut();
            } else {
                Alert.alert('Not found', resultAction.payload || 'Unable to locate address');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal transparent visible={visible} onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <TouchableWithoutFeedback onPress={animateOut}>
                    <Animated.View style={[styles.modalOverlay, fadeStyle]}>
                        <GestureDetector gesture={gesture}>
                            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                                <Animated.View style={[styles.modalContent, animatedStyle]}>
                                    <Notch />
                                    <Text style={styles.modalTitle}>Set Location Manually</Text>
                                    <Autocomplete
                                        onPlaceSelected={(details) => {
                                            const location = details?.formatted_address;
                                            if (location) {
                                                setAddress(location);
                                            }
                                        }}
                                        types="address"
                                    />
                                    <View style={styles.buttonContainer}>
                                        <Text
                                            onPress={!loading && address?.trim() ? handleSubmit : undefined}
                                            style={[
                                                styles.saveButton,
                                                (!address.trim() || loading) && { opacity: 0.5 },
                                            ]}
                                        >
                                            {loading ? 'Saving...' : 'Save'}
                                        </Text>
                                    </View>
                                </Animated.View>
                            </TouchableWithoutFeedback>
                        </GestureDetector>
                    </Animated.View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    modalContent: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        minHeight: 180,
        paddingBottom: 255,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
    },
    input: {
        height: 44,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        fontSize: 16,
        marginBottom: 10,
    },
    submitBtn: {
        fontSize: 16,
        color: '#007bff',
        marginTop: 5,
        fontWeight: '600',
    },
    buttonContainer: {
        marginTop: 20,
        top: 100,
        width: '50%',
        alignSelf: 'center',
    },
    saveButton: {
        fontSize: 16,
        color: 'white',
        backgroundColor: '#007bff',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        alignSelf: 'center',
        fontWeight: '600',
    },
});

export default ChangeLocationModal;
