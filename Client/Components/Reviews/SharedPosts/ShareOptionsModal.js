import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TouchableWithoutFeedback } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useSlideDownDismiss from '../../../utils/useSlideDown';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import Notch from '../../Notch/Notch';

const ShareOptionsModal = ({
    visible,
    onClose,
    onShareToFeed,
    onShareToStory,
}) => {
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

    return (
        <Modal visible={visible} transparent style={styles.bottomModal}>
            <TouchableWithoutFeedback onPress={animateOut}>
                <View style={styles.overlay}>
                    <GestureDetector gesture={gesture}>
                        <Animated.View style={[styles.modalContent, animatedStyle]}>
                            <Notch />
                            <TouchableOpacity onPress={onShareToFeed} style={styles.modalButton}>
                                <MaterialCommunityIcons name="post-outline" size={20} color="black" />
                                <Text style={styles.modalButtonText}>Share to Feed</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onShareToStory} style={styles.modalButton}>
                                <MaterialCommunityIcons name="camera-wireless-outline" size={20} color="black" />
                                <Text style={styles.modalButtonText}>Share to Story</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </GestureDetector>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    )
};

export default ShareOptionsModal;

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: '#00000088',
        justifyContent: 'flex-end',
    },
    bottomModal: {
        justifyContent: 'flex-end',
        margin: 0,
    },
    modalContent: {
        backgroundColor: '#fff',
        padding: 15,
        borderTopLeftRadius: 15,
        borderTopRightRadius: 15,
        alignItems: 'center',
        paddingBottom: 30,
    },
    modalButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        width: '100%',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    modalButtonText: {
        fontSize: 16,
        marginLeft: 10,
        color: '#000',
    },
    modalCancelButton: {
        padding: 15,
        width: '100%',
        alignItems: 'center',
    },
    modalCancelButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#007bff',
    },
});
