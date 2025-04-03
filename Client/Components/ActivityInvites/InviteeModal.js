import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Modal,
    Dimensions,
    Animated,
    Image,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg'

const SCREEN_HEIGHT = Dimensions.get('window').height;

const InviteeModal = ({ visible, onClose, recipients = [] }) => {
    const [selectedTab, setSelectedTab] = useState('going'); // 'going' or 'invited'

    const going = recipients.filter(r => r.status === 'accepted');
    const invited = recipients;

    const translateY = useRef(new Animated.Value(0)).current;
    const gestureThreshold = 100;

    useEffect(() => {
        if (!visible) {
            translateY.setValue(0);
        }
    }, [visible]);

    const onGestureEvent = Animated.event(
        [{ nativeEvent: { translationY: translateY } }],
        {
            useNativeDriver: false,
            listener: (event) => {
                const { translationY } = event.nativeEvent;
                if (translationY < 0) {
                    translateY.setValue(0);
                }
            },
        }
    );

    const onHandlerStateChange = ({ nativeEvent }) => {
        if (nativeEvent.state === State.END) {
            if (nativeEvent.translationY > gestureThreshold) {
                onClose();
            } else {
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: false,
                }).start();
            }
        }
    };

    return (
        <Modal visible={visible} transparent animationType='slide'>
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <PanGestureHandler
                        onGestureEvent={onGestureEvent}
                        onHandlerStateChange={onHandlerStateChange}
                    >
                        <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
                            <View style={styles.notchContainer}>
                                <View style={styles.notch} />
                            </View>

                            <Text style={styles.title}>Who's Going</Text>

                            <View style={styles.toggleContainer}>
                                <TouchableOpacity
                                    onPress={() => setSelectedTab('going')}
                                    style={[
                                        styles.toggleButton,
                                        selectedTab === 'going' && styles.activeTab,
                                    ]}
                                >
                                    <Text style={selectedTab === 'going' ? styles.activeText : styles.inactiveText}>
                                        Going ({going.length})
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setSelectedTab('invited')}
                                    style={[
                                        styles.toggleButton,
                                        selectedTab === 'invited' && styles.activeTab,
                                    ]}
                                >
                                    <Text style={selectedTab === 'invited' ? styles.activeText : styles.inactiveText}>
                                        Invited ({invited.length})
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {selectedTab === 'going' ? (
                                going.length > 0 ? (
                                    going.map((user, idx) => (
                                        <View style={styles.usersList}>
                                            <Image 
                                                source={
                                                    { uri: user?.user?.profilePicUrl || user?.profilePicUrl } ||
                                                    profilePicPlaceholder
                                                }  
                                                style={styles.profilePic}
                                            />
                                            <Text key={idx} style={styles.userText}>
                                                {user.user?.firstName || user?.firstName} {user.user?.lastName || user.lastName}
                                            </Text>
                                        </View>
                                    ))
                                ) : (
                                    <Text style={styles.userText}>No one has accepted yet.</Text>
                                )
                            ) : (
                                invited.map((user, idx) => (
                                    <View style={styles.usersList}>
                                        <Image 
                                            source={
                                                { uri: user?.user?.profilePicUrl || user?.profilePicUrl } ||
                                                profilePicPlaceholder
                                            }  
                                            style={styles.profilePic}
                                        />
                                        <Text key={idx} style={styles.userText}>
                                            {user.user?.firstName || user.firstName} {user.user?.lastName || user.lastName}
                                        </Text>
                                    </View>
                                ))
                            )}
                        </Animated.View>
                    </PanGestureHandler>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

export default InviteeModal;

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: '#00000088',
        justifyContent: 'flex-end',
    },
    container: {
        width: '100%',
        height: SCREEN_HEIGHT * 0.50,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    notchContainer: {
        alignItems: 'center',
        marginBottom: 15,
    },
    notch: {
        width: 40,
        height: 5,
        backgroundColor: '#ccc',
        borderRadius: 3,
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 10,
    },
    toggleContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 10,
    },
    toggleButton: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        marginHorizontal: 6,
        backgroundColor: '#f0f0f0',
    },
    activeTab: {
        backgroundColor: '#007bff',
    },
    activeText: {
        color: '#fff',
        fontWeight: '600',
    },
    inactiveText: {
        color: '#333',
    },
    userText: {
        fontSize: 16,
        marginVertical: 2,
        color: '#555',
        paddingLeft: 4,
    },
    profilePic: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginRight: 6,
    },
    usersList: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 5,
    }
});
