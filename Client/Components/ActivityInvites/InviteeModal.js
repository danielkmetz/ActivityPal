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
import { acceptInviteRequest, rejectInviteRequest, } from '../../Slices/InvitesSlice';
import { createNotification } from '../../Slices/NotificationsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from 'react-redux';
import { setUserAndFriendsReviews, selectUserAndFriendsReviews } from '../../Slices/ReviewsSlice';
import { setNotifications, selectNotifications } from '../../Slices/NotificationsSlice';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const InviteeModal = ({ visible, onClose, requests, recipients = [], isSender, invite }) => {
    const dispatch = useDispatch();
    const [selectedTab, setSelectedTab] = useState('going'); // 'going' or 'invited'
    const user = useSelector(selectUser);
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const notifications = useSelector(selectNotifications);
    
    const going = recipients.filter(r => r.status === 'accepted');
    const invited = recipients.filter(r => r.status !== 'accepted');

    const translateY = useRef(new Animated.Value(0)).current;
    const gestureThreshold = 100;

    //console.log(invite)

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

    const handleAcceptJoinRequest = async (relatedId, targetId) => {
            try {
                const { payload: result } = await dispatch(
                    acceptInviteRequest({ userId: relatedId, inviteId: targetId })
                );
        
                if (!result.success || !result.invite) {
                    console.warn('⚠️ No valid invite returned from backend');
                    throw new Error('Backend did not return a valid invite');
                }
        
                const updatedInvite = result.invite;
        
                // ✅ Send confirmation notification
                const notifPayload = {
                    userId: relatedId,
                    type: 'activityInviteAccepted',
                    message: `${user.firstName} ${user.lastName} accepted your request to join the event.`,
                    relatedId: user.id,
                    typeRef: 'ActivityInvite',
                    targetId,
                    targetRef: 'ActivityInvite',
                    postType: 'invite',
                };
        
                await dispatch(createNotification(notifPayload));
        
                // ✅ Replace the invite in the list
                const updatedList = userAndFriendsReviews.map(invite =>
                    invite._id === targetId ? updatedInvite : invite
                );
    
                dispatch(setUserAndFriendsReviews(updatedList));
        
                // ✅ Remove the requestInvite notification
                const filtered = notifications.filter(n =>
                    !(n.type === 'requestInvite' && n.relatedId === relatedId && n.targetId === targetId)
                );
        
                dispatch(setNotifications(filtered));
        
            } catch (error) {
                console.error('❌ Error accepting join request:', error);
            }
    };
    
    const handleRejectJoinRequest = async (relatedId, targetId) => {
            try {
                const { payload: result } = await dispatch(
                    rejectInviteRequest({ userId: relatedId, inviteId: targetId })
                );

                if (!result.success || !result.invite) {
                    console.warn('⚠️ No valid invite returned from backend');
                    throw new Error('Backend did not return a valid invite');
                }

                const updatedInvite = result.invite;
    
                // ✅ Notify the user who was rejected
                await dispatch(
                    createNotification({
                        userId: relatedId,
                        type: 'activityInviteDeclined',
                        message: `${user.firstName} ${user.lastName} declined your request to join the event.`,
                        relatedId: user.id,
                        typeRef: 'User',
                        targetId,
                        postType: 'invite',
                    })
                );

                // ✅ Replace the invite in the list
                const updatedList = userAndFriendsReviews.map(invite =>
                    invite._id === targetId ? updatedInvite : invite
                );
    
                dispatch(setUserAndFriendsReviews(updatedList));
    
                const filtered = notifications.filter(n =>
                    !(n.type === 'requestInvite' && n.relatedId === relatedId && n.targetId === targetId)
                );
                await dispatch(setNotifications(filtered));
            } catch (error) {
                console.error('❌ Error rejecting join request:', error);
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
                                    style={[styles.toggleButton, selectedTab === 'going' && styles.activeTab]}
                                >
                                    <Text style={selectedTab === 'going' ? styles.activeText : styles.inactiveText}>
                                        Going ({going.length})
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setSelectedTab('invited')}
                                    style={[styles.toggleButton, selectedTab === 'invited' && styles.activeTab]}
                                >
                                    <Text style={selectedTab === 'invited' ? styles.activeText : styles.inactiveText}>
                                        Pending ({invited.length})
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setSelectedTab('requested')}
                                    style={[styles.toggleButton, selectedTab === 'requested' && styles.activeTab]}
                                >
                                    <Text style={selectedTab === 'requested' ? styles.activeText : styles.inactiveText}>
                                        Requests ({requests.length})
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            {selectedTab === 'going' && (
                                going.length > 0 ? (
                                    going.map((user, idx) => (
                                        <View key={idx} style={styles.usersList}>
                                            <Image
                                                source={
                                                    { uri: user?.user?.profilePicUrl || user?.profilePicUrl } ||
                                                    profilePicPlaceholder
                                                }
                                                style={styles.profilePic}
                                            />
                                            <Text style={styles.userText}>
                                                {user.user?.firstName || user?.firstName} {user.user?.lastName || user?.lastName}
                                            </Text>
                                        </View>
                                    ))
                                ) : (
                                    <Text style={styles.userText}>No one has accepted yet.</Text>
                                )
                            )}

                            {selectedTab === 'invited' && (
                                invited.length > 0 ? (
                                    invited.map((user, idx) => (
                                        <View key={idx} style={styles.usersList}>
                                            <Image
                                                source={
                                                    { uri: user?.user?.profilePicUrl || user?.profilePicUrl } ||
                                                    profilePicPlaceholder
                                                }
                                                style={styles.profilePic}
                                            />
                                            <Text style={styles.userText}>
                                                {user.user?.firstName || user?.firstName} {user.user?.lastName || user?.lastName}
                                            </Text>
                                        </View>
                                    ))
                                ) : (
                                    <Text style={styles.userText}>No pending invites.</Text>
                                )
                            )}

                            {selectedTab === 'requested' && (
                                requests.length > 0 ? (
                                    requests.map((user, idx) => (
                                        <View key={idx} style={[styles.usersList, {marginTop: 10}]}>
                                            <Image
                                                source={user.profilePicUrl ? { uri: user.profilePicUrl } : profilePicPlaceholder}
                                                style={styles.profilePic}
                                            />
                                            <Text style={styles.userText}>
                                                {user.firstName} {user.lastName}
                                            </Text>
                                            {isSender && (
                                                <View style={styles.acceptDecline}>
                                                    <TouchableOpacity 
                                                        style={styles.accept} 
                                                        onPress={() => handleAcceptJoinRequest(user.userId, invite._id)}
                                                    >
                                                        <Text style={styles.buttonText}>Accept</Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity 
                                                        style={styles.decline}
                                                        onPress={() => handleRejectJoinRequest(user.userId, invite._id)}
                                                    >
                                                        <Text style={styles.buttonText}>Decline</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    ))
                                ) : (
                                    <Text style={styles.userText}>No join requests yet.</Text>
                                )
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
    },
    acceptDecline: {
        flexDirection: 'row',
        marginLeft: 10,
    },
    accept: {
        marginLeft: 10,
        backgroundColor: '#009999',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 5,
    },
    decline: {
        marginLeft: 10,
        backgroundColor: '#808080',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 5,
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
    },
});
