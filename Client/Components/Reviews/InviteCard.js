import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import InviteeModal from '../ActivityInvites/InviteeModal';
import { formatEventDate } from '../../functions';
import { requestInvite, deleteInvite } from '../../Slices/InvitesSlice';
import { createNotification } from '../../Slices/NotificationsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from 'react-redux';
import { removePostFromFeeds, replacePostInFeeds } from '../../Slices/ReviewsSlice';
import InviteModal from '../ActivityInvites/InviteModal';
import PostActions from './PostActions/PostActions';
import PostOptionsMenu from './PostOptionsMenu';
import { useNavigation } from '@react-navigation/native';
import InviteHeader from './Invites/InviteHeader';
import BusinessBadge from './Invites/BusinessBadge';
import CountdownPill from './Invites/CountdownPill';
import AttendanceRow from './Invites/AttendanceRow';
import { useInviteState } from './Invites/useInviteState';
import { medium } from '../../utils/Haptics/haptics';

const InviteCard = ({ invite, handleLikeWithAnimation, handleOpenComments, onShare, sharedPost }) => {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const [modalVisible, setModalVisible] = useState(false);
    const [editInviteModal, setEditInviteModal] = useState(false);
    const [inviteToEdit, setInviteToEdit] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const user = useSelector(selectUser);
    const businessName = invite.businessName || invite.business?.businessName || 'Unnamed Location';
    const totalInvited = invite.recipients?.length || 0;
    const totalGoing = invite.recipients?.filter(r => r.status === 'accepted').length || 0;
    const userId = user?.id;
    const senderId = invite?.sender?.id;
    const recipientId = invite?.sender?.id || invite?.sender?.userId;
    const [requested, setRequested] = useState(false);
    const hasRequested = requested || invite.requests?.some(r => r.userId === user.id);
    const businessLogoUrl = invite?.businessLogoUrl;
    const { timeLeft, isSender, isRecipient } = useInviteState(invite, user?.id);

    const handleEdit = () => {
        if (invite) {
            navigation.navigate("CreatePost", {
                postType: "invite",
                isEditing: true,
                initialPost: invite,
            });
        }
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
                            await dispatch(removePostFromFeeds(invite._id));
                            medium();

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

            await dispatch(createNotification(notificationPayload)).unwrap();

            dispatch(replacePostInFeeds(updatedInvite));

            setRequested(true);

            alert('Your request has been sent!');
        } catch (err) {
            console.error('❌ Failed to request invite or send notification:', err);
            alert(`Something went wrong. ${err?.message || ''}`);
        }
    };

    const navigateToOtherUserProfile = (userId) => {
        if (userId !== user?.id) {
            navigation.navigate('OtherUserProfile', { userId }); // Pass user data to the new screen
        } else {
            navigation.navigate('Profile');
        }
    };

    useEffect(() => {
        if (invite.requests?.some(r => r.userId === userId)) {
            setRequested(true);
        }
    }, [invite, userId]);

    return (
        <>
            <View style={styles.card}>
                {!sharedPost && (
                    <PostOptionsMenu
                        isSender={isSender}
                        dropdownVisible={dropdownVisible}
                        setDropdownVisible={setDropdownVisible}
                        handleEdit={handleEdit}
                        handleDelete={handleDelete}
                        postData={invite}
                    />
                )}
                <InviteHeader sender={invite.sender} totalInvited={totalInvited} onPressName={() => navigateToOtherUserProfile(invite.senderId)} />
                <BusinessBadge name={businessName} logoUrl={businessLogoUrl} />
                {invite.dateTime ? (
                    <Text style={styles.datetime}>On {formatEventDate(invite.dateTime)}</Text>
                ) : null}
                {invite.note ? (
                    <Text style={styles.note}>{invite.note}</Text>
                ) : null}
                <CountdownPill value={timeLeft} />
                <AttendanceRow
                    isSender={isSender}
                    isRecipient={isRecipient}
                    hasRequested={hasRequested}
                    onRequestJoin={handleRequest}
                    totalGoing={totalGoing}
                    onOpenInvitees={() => setModalVisible(true)}
                />
                <View style={styles.actionsContainer}>
                    {!sharedPost && (
                        <View style={{ marginTop: 10 }}>
                            <PostActions
                                item={invite}
                                handleLikeWithAnimation={handleLikeWithAnimation}
                                handleOpenComments={handleOpenComments}
                                onShare={onShare}
                            />
                        </View>
                    )}
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
    datetime: {
        fontSize: 13,
        color: '#666',
    },
    note: {
        fontStyle: 'italic',
        color: '#555',
        marginTop: 10,
    },
    actionsContainer: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
});

export default InviteCard;
