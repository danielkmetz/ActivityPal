import React, { useEffect, useState } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableWithoutFeedback,
    Keyboard,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Animated, {
    useSharedValue,
    withTiming,
    useAnimatedStyle,
} from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSelector, useDispatch } from 'react-redux';
import { googlePlacesDefaultProps } from '../../utils/googleplacesDefaults';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import {
    selectCoordinates,
    geocodeAddressThunk,
    reverseGeocodeThunk,
    selectReverseGeocodeAddress,
    selectManualCoordinates,
    selectLocationModalVisible,
    closeLocationModal,
} from '../../Slices/LocationSlice';
import Notch from '../Notch/Notch';
import useSlideDownDismiss from '../../utils/useSlideDown';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;

const ChangeLocationModal = ({ onLocationSelected }) => {
    const dispatch = useDispatch();
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const visible = useSelector(selectLocationModalVisible);
    const coordinates = useSelector(selectCoordinates);
    const manualCoordinates = useSelector(selectManualCoordinates);
    const reverseGeocodeAddress = useSelector(selectReverseGeocodeAddress);

    const fadeAnim = useSharedValue(0);
    const onClose = () => {
        dispatch(closeLocationModal());
    };
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
    const { lat, lng } = coordinates;

    useEffect(() => {
        fadeAnim.value = withTiming(visible ? 1 : 0, { duration: 100 });

        if (visible) {
            animateIn();
            dispatch(reverseGeocodeThunk(coordinates))
                .unwrap()
                .then(setAddress)
                .catch((err) => console.warn('Reverse geocode failed:', err));
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
                const { lat, lng } = resultAction.payload;
                onLocationSelected({ latitude: lat, longitude: lng });
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
                                    <View style={{ zIndex: 999, position: 'relative' }}>
                                        <GooglePlacesAutocomplete
                                            placeholder="Enter address"
                                            fetchDetails
                                            enablePoweredByContainer={false}
                                            onPress={(data, details = null) => {
                                                const location = details?.geometry?.location;
                                                if (location) {
                                                    onLocationSelected({ latitude: location.lat, longitude: location.lng });
                                                    dispatch(closeLocationModal());
                                                }
                                            }}
                                            query={{ key: GOOGLE_API_KEY, language: "en", types: "establishment" }}
                                            styles={{
                                                textInput: styles.input,
                                                listView: {
                                                    backgroundColor: "#fff",
                                                    maxHeight: 250,
                                                    zIndex: 9999, // ⬅️ ensure this is high
                                                },
                                            }}
                                            textInputProps={{
                                                autoCapitalize: 'none',
                                                autoCorrect: false,
                                                placeholderTextColor: '#999',
                                            }}
                                            {...googlePlacesDefaultProps}
                                        />
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
        paddingBottom: 300,
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
});

export default ChangeLocationModal;
