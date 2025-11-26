import React, { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import Animated from 'react-native-reanimated';
import useSlideDownDismiss from '../../utils/useSlideDown';
import { GestureDetector } from 'react-native-gesture-handler';
import { Avatar } from 'react-native-paper';
import Notch from '../Notch/Notch';
import { getTimeLabel } from '../../utils/formatEventPromoTime';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

const SuggestionDetailsModal = ({ visible, onClose, suggestion }) => {
    const { businessName, distance, details } = suggestion;
    const title = suggestion?.title || details?.title;
    const description = suggestion?.description || details?.description;
    const logoUrl = suggestion?.logoUrl || suggestion?.businessLogoUrl || profilePicPlaceholder;
    const address = suggestion?.location?.formattedAddress || suggestion?.formattedAddress || details?.address; 
    const { gesture, animateIn, animateOut, animatedStyle, } = useSlideDownDismiss(onClose);
    
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

    return (
        <Modal
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={animateOut}>
                <Animated.View style={styles.modalOverlay}>
                    <GestureDetector gesture={gesture}>
                        <TouchableWithoutFeedback>
                            <Animated.View style={[styles.modalContent, animatedStyle]}>
                                <Notch />
                                <View style={styles.header}>
                                    <Avatar.Image
                                        size={45}
                                        rounded
                                        source={{ uri: logoUrl }}
                                        containerStyle={{ backgroundColor: "#ccc", marginRight: 10 }}
                                    />
                                    <View style={{ flexShrink: 1 }}>
                                        <Text style={styles.businessName}>{businessName}</Text>
                                        <Text style={[styles.distance, { marginTop: 5, }]}>{address}</Text>
                                        <Text style={styles.distance}>
                                            {distance ? `${(distance / 1609).toFixed(1)} mi away` : null}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.modalTitle}>{title}</Text>
                                <Text style={styles.modalTime}>{getTimeLabel(suggestion)}</Text>
                                <Text style={styles.modalNote}>{description}</Text>
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
