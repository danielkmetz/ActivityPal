import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import InviteeModal from '../ActivityInvites/InviteeModal';
import { formatEventDate, getTimeLeft } from '../../functions';
import { requestInvite } from '../../Slices/InvitesSlice';
import { createNotification } from '../../Slices/NotificationsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from 'react-redux';
import { setUserAndFriendsReviews, selectUserAndFriendsReviews } from '../../Slices/ReviewsSlice';
import InviteModal from '../ActivityInvites/InviteModal';
import { deleteInvite } from '../../Slices/InvitesSlice';
import PostActions from './PostActions';
import PostOptionsMenu from './PostOptionsMenu';
import { useNavigation } from '@react-navigation/native';

const InviteCard = ({ invite, handleLikeWithAnimation, handleOpenComments }) => {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const [timeLeft, setTimeLeft] = useState(getTimeLeft(invite.dateTime));
    const [modalVisible, setModalVisible] = useState(false);
    const [editInviteModal, setEditInviteModal] = useState(false);
    const [inviteToEdit, setInviteToEdit] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const user = useSelector(selectUser);
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const businessName = invite.businessName || invite.business?.businessName || 'Unnamed Location';
    const totalInvited = invite.recipients?.length || 0;
    const totalGoing = invite.recipients?.filter(r => r.status === 'accepted').length || 0;
    const userId = user?.id;
    const senderId = invite?.sender?.id;
    const recipientId = invite?.sender?.id || invite?.sender?.userId;
    const [requested, setRequested] = useState(false);
    const hasRequested = requested || invite.requests?.some(r => r.userId === user.id);
    const isRecipient = userId !== senderId && !invite.recipients?.some(r => r.userId?.toString() === user.id?.toString());
    const isSender = userId === senderId;

    const handleEdit = () => {
        navigation.navigate("CreatePost", {
            postType: "invite",
            isEditing: true,
            initialInvite: invite,
        });
    };

    const handleDelete = (invite) => {
        Alert.alert(
            'Confirm Deletion',
            'Are you sure you want to delete your event?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const recipientIds = invite.recipients.map(r => r.userId);

                            await dispatch(
                                deleteInvite({
                                    senderId: user.id,
                                    inviteId: invite._id,
                                    recipientIds,
                                })
                            ).unwrap();

                            // ✅ Remove invite from local state
                            dispatch(setUserAndFriendsReviews(
                                userAndFriendsReviews.filter(item => item._id !== invite._id)
                            ));

                            // ✅ Close out UI
                            setIsEditing(false);
                            setInviteToEdit(null);

                            Alert.alert('Invite Deleted', 'The invite was successfully removed.');
                        } catch (err) {
                            console.error('❌ Failed to delete invite:', err);
                            Alert.alert('Error', 'Could not delete the invite. Please try again.');
                        }
                    },
                },
            ],
            { cancelable: true }
        );
    };

    const handleRequest = async () => {
        try {
            console.log('📨 Submitting invite request...');
            console.log('➡️ Payload being sent to requestInvite:', {
                userId: user.id,
                inviteId: invite._id,
            });

            const { payload: result } = await dispatch(requestInvite({
                userId: user.id,
                inviteId: invite._id,
            }));

            if (!result.success || !result.invite) {
                console.warn('⚠️ No valid invite returned from backend');
                throw new Error('Backend did not return a valid invite');
            }

            const updatedInvite = result.invite;

            const notificationPayload = {
                recipientId,
                userId: senderId,
                relatedId: user.id,
                type: 'requestInvite',
                message: `${user.firstName} wants to join your Vybe at ${businessName}`,
                postType: 'activityInvite',
                typeRef: 'User',
                targetId: invite._id,
                targetRef: 'ActivityInvite',
            };

            console.log('📨 Sending notification with payload:', notificationPayload);
            await dispatch(createNotification(notificationPayload)).unwrap();

            // ✅ Replace the invite in the feed
            const updatedList = userAndFriendsReviews.map(item =>
                item._id === updatedInvite._id ? updatedInvite : item
            );

            const updatedInvites = updatedList.filter(item => item.type === 'invite');
            console.log('🆕 Updated invites only:', updatedInvites);

            dispatch(setUserAndFriendsReviews(updatedList));

            setRequested(true);

            alert('Your request has been sent!');
        } catch (err) {
            console.error('❌ Failed to request invite or send notification:', err);
            alert(`Something went wrong. ${err?.message || ''}`);
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft(getTimeLeft(invite.dateTime));
        }, 1000);

        return () => clearInterval(interval);
    }, [invite.dateTime]);

    useEffect(() => {
        if (invite.requests?.some(r => r.userId === user.id)) {
            setRequested(true);
        }
    }, [invite, user.id]);

    return (
        <>
            <View style={styles.card}>
                <PostOptionsMenu
                    isSender={isSender}
                    dropdownVisible={dropdownVisible}
                    setDropdownVisible={setDropdownVisible}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                    postData={invite}
                />
                <View style={styles.header}>
                    <Image
                        source={invite.sender?.profilePicUrl ? { uri: invite.sender.profilePicUrl } : profilePicPlaceholder}
                        style={styles.profilePic}
                    />
                    <View style={styles.headerText}>
                        <Text style={styles.senderName}>
                            {invite.sender?.firstName} {invite.sender?.lastName} invited {totalInvited} friend
                            {totalInvited.length === 1 ? '' : 's'} to a Vybe
                        </Text>
                    </View>
                </View>

                <Text style={styles.businessName}>{businessName}</Text>
                {invite.dateTime ? (
                    <Text style={styles.datetime}>On {formatEventDate(invite.dateTime)}</Text>
                ) : null}

                {invite.note ? (
                    <Text style={styles.note}>{invite.note}</Text>
                ) : null}

                <View style={styles.countdownContainer}>
                    <Text style={styles.countdownLabel}>Starts in:</Text>
                    <Text style={styles.countdownText}>{timeLeft}</Text>
                </View>

                <View style={styles.actionsContainer}>
                    <PostActions
                        item={invite}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        handleOpenComments={handleOpenComments}
                    />
                    <View style={styles.requestsAttendance}>
                        {!isRecipient || !isSender && (
                            hasRequested ? (
                                <View style={styles.requestedContainer}>
                                    <Text style={styles.requestedText}>✅ Requested</Text>
                                </View>
                            ) : (
                                <TouchableOpacity onPress={handleRequest} style={styles.attendanceContainer}>
                                    <Text style={styles.attendanceText}>✋ Ask to Join</Text>
                                </TouchableOpacity>
                            )
                        )}
                        <TouchableOpacity style={styles.attendanceContainer} onPress={() => setModalVisible(true)}>
                            <Text style={styles.attendanceText}>{totalGoing} going</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            <InviteeModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                recipients={invite.recipients}
                requests={invite.requests}
                isSender={isSender}
                invite={invite}
            />

            <InviteModal
                visible={editInviteModal}
                onClose={() => setEditInviteModal(false)}
                setShowInviteModal={setEditInviteModal}
                initialInvite={inviteToEdit}
                setInviteToEdit={setInviteToEdit}
                isEditing={isEditing}
                setIsEditing={setIsEditing}
            />
        </>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        padding: 10,
        marginBottom: 8,
        borderRadius: 10,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    profilePic: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
    },
    headerText: {
        flexDirection: 'column',
    },
    senderName: {
        fontWeight: 'bold',
        fontSize: 16,
    },
    datetime: {
        fontSize: 13,
        color: '#666',
    },
    businessName: {
        fontSize: 16,
        fontWeight: '600',
        marginVertical: 5,
        color: '#333',
    },
    note: {
        fontStyle: 'italic',
        color: '#555',
        marginTop: 10,
    },
    countdownContainer: {
        marginTop: 15,
        padding: 10,
        backgroundColor: '#e6f0ff',
        borderRadius: 8,
        alignItems: 'center',
    },
    countdownLabel: {
        fontSize: 13,
        color: '#666',
    },
    countdownText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#007bff',
    },
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    attendanceContainer: {
        marginTop: 10,
        alignItems: 'center',
        backgroundColor: '#f0f0f0',
        padding: 8,
        borderRadius: 6,
    },
    attendanceText: {
        fontSize: 14,
        color: '#007bff',
    },
    modalOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#fff',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '50%',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    modalUser: {
        fontSize: 16,
        marginVertical: 4,
        color: '#333',
    },
    closeButton: {
        marginTop: 15,
        padding: 10,
        alignItems: 'center',
        backgroundColor: '#007bff',
        borderRadius: 10,
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 16,
    },
    likeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 10,
    },
    likeButtonText: {
        fontSize: 14,
        color: '#555',
        marginLeft: 5,
    },
    likeCount: {
        fontSize: 14,
        color: '#555',
        marginLeft: 5,
    },
    commentCount: {
        marginLeft: 5,
    },
    commentButton: {
        borderRadius: 5,
        marginLeft: 6,
        flexDirection: 'row',
    },
    commentButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    likeComment: {
        flexDirection: 'row',
        marginTop: 10,
    },
    requestsAttendance: {
        flexDirection: 'row',
    },
    requestedContainer: {
        marginTop: 10,
        alignItems: 'center',
        backgroundColor: '#ddd',
        padding: 8,
        borderRadius: 6,
        marginRight: 5,
    },
    requestedText: {
        fontSize: 14,
        color: '#888',
    },
    attendanceContainer: {
        marginTop: 10,
        alignItems: 'center',
        backgroundColor: '#f0f0f0',
        padding: 8,
        borderRadius: 6,
        marginRight: 5,
    },
    attendanceText: {
        fontSize: 14,
        color: '#007bff', // blue color for call-to-action
    },
    menuWrapper: {
        position: 'absolute',
        top: -10,
        right: -5,
        zIndex: 11,
    },
    menuIcon: {
        padding: 4,
    },
    dropdownMenu: {
        position: 'absolute',
        top: 25,
        right: 0,
        backgroundColor: 'white',
        borderRadius: 6,
        elevation: 5,
        paddingVertical: 4,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        zIndex: 20,
        minWidth: 100,
    },
    dropdownRow: {
        flexDirection: 'row'
    },
    dropdownItem: {
        marginTop: 10,
    },
    divider: {
        height: 1,
        backgroundColor: '#ddd',
        marginVertical: 4,
    },


});

export default InviteCard;
