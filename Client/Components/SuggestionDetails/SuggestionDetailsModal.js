import React, { useRef, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    TouchableWithoutFeedback,
} from 'react-native';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import useSlideDownDismiss from '../../utils/useSlideDown';
import { GestureDetector } from 'react-native-gesture-handler';
import { Avatar } from '@rneui/themed';
import Notch from '../Notch/Notch';

const SuggestionDetailsModal = ({ visible, onClose, suggestion }) => {
    const { businessName, logoUrl, distance, title } = suggestion;
    const { gesture, animateIn, animateOut, animatedStyle, } = useSlideDownDismiss(onClose);
    const fadeAnim = useSharedValue(0);

    useEffect(() => {
        fadeAnim.value = withTiming(visible ? 1 : 0, { duration: 100 });

        if (visible) {
            animateIn();            
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

    const formatTime = (isoString) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    const getTimeLabel = () => {
        if (suggestion?.allDay) return 'Happening All Day';

        if (suggestion?.kind === 'activePromo' || suggestion?.kind === 'activeEvent') {
            return suggestion?.endTime ? `Ends at ${formatTime(suggestion.endTime)}` : null;
        }

        if (suggestion?.kind === 'upcomingPromo' || suggestion?.kind === 'upcomingEvent') {
            return suggestion?.startTime ? `Starts at ${formatTime(suggestion.startTime)}` : null;
        }

        return null;
    };

    console.log(visible)

    return (
        <Modal
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={animateOut}>
                <Animated.View style={[styles.modalOverlay, fadeStyle]}>
                    <GestureDetector gesture={gesture}>
                        <TouchableWithoutFeedback>
                            <Animated.View style={[styles.modalContent, animatedStyle]}>
                                <Notch />
                                <View style={styles.header}>
                                    <Avatar
                                        size={45}
                                        rounded
                                        source={logoUrl ? { uri: logoUrl } : require("../../assets/pics/profile-pic-placeholder.jpg")}
                                        containerStyle={{ backgroundColor: "#ccc", marginRight: 10 }}
                                    />
                                    <View style={{ flexShrink: 1 }}>
                                        <Text style={styles.businessName}>{businessName}</Text>
                                        <Text style={[styles.distance, { marginTop: 5,}]}>{suggestion.location.formattedAddress}</Text>
                                        <Text style={styles.distance}>
                                            {distance ? `${(distance / 1609).toFixed(1)} mi away` : null}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.modalTitle}>{suggestion?.title}</Text>
                                {getTimeLabel() && (
                                    <Text style={styles.modalTime}>{getTimeLabel()}</Text>
                                )}
                                <Text style={styles.modalNote}>
                                    {suggestion?.description}
                                </Text>
                            </Animated.View>
                        </TouchableWithoutFeedback>
                    </GestureDetector>
                </Animated.View>
            </TouchableWithoutFeedback>
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
        paddingBottom: 100
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    modalTime: {
        fontSize: 14,
        color: '#d32f2f',
        fontWeight: '600',
        marginBottom: 10,
    },
    modalNote: {
        fontSize: 16,
        color: '#666',
    },
    distance: {
        fontSize: 12,
        color: "#777",
    },
    businessName: {
        fontSize: 15,
        fontWeight: "600",
    },
});

export default SuggestionDetailsModal;
