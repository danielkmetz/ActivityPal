import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import InviteeModal from '../ActivityInvites/InviteeModal/InviteeModal';
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
import CountdownPill from './Invites/CountdownPill';
import AttendanceRow from './Invites/AttendanceRow';
import { useInviteState } from './Invites/useInviteState';
import { medium } from '../../utils/Haptics/haptics';
import NonOwnerOptions from './PostOptionsMenu/NonOwnerPostOptions';
import ViewerOptionsTrigger from './PostOptionsMenu/ViewerOptionsTrigger';
import BusinessLink from './PostHeader/BusinessLink';

const InviteCard = ({ invite, handleOpenComments, onShare, embeddedInShared }) => {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const postContent = invite?.original ?? invite ?? {};
    const [modalVisible, setModalVisible] = useState(false);
    const [editInviteModal, setEditInviteModal] = useState(false);
    const [inviteToEdit, setInviteToEdit] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);
    const user = useSelector(selectUser);
    const businessName = postContent.businessName || postContent.business?.businessName || 'Unnamed Location';
    const totalInvited = postContent.recipients?.length || 0;
    const userId = user?.id;
    const senderId = postContent?.sender?.id;
    const recipientId = postContent?.sender?.id || postContent?.sender?.userId;
    const [requested, setRequested] = useState(false);
    const hasRequested = requested || postContent.requests?.some(r => r.userId === userId);
    const { timeLeft, isSender } = useInviteState(postContent, user?.id);

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
                userId,
                inviteId: postContent._id,
            }));

            if (!result.success || !result.invite) {
                console.warn('⚠️ No valid invite returned from backend');
                throw new Error('Backend did not return a valid invite');
            }

            const updatedInvite = result.invite;

            const notificationPayload = {
                recipientId,
                userId: senderId,
                relatedId: userId,
                type: 'requestInvite',
                message: `${user.firstName} wants to join your Vybe at ${businessName}`,
                postType: 'activityInvite',
                typeRef: 'User',
                targetId: postContent._id,
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
        if (postContent.requests?.some(r => r.userId === userId)) {
            setRequested(true);
        }
    }, [invite, userId]);

    return (
        <>
            <View style={styles.card}>
                {!embeddedInShared && (
                    <PostOptionsMenu
                        dropdownVisible={dropdownVisible}
                        setDropdownVisible={setDropdownVisible}
                        handleEdit={handleEdit}
                        handleDelete={handleDelete}
                        postData={invite}
                    />
                )}
                <ViewerOptionsTrigger
                    post={invite}
                    onPress={() => setViewerOptionsVisible(true)}
                />
                <InviteHeader sender={postContent.sender} totalInvited={totalInvited} onPressName={() => navigateToOtherUserProfile(senderId)} />
                <BusinessLink post={invite} />
                {postContent.dateTime ? (
                    <Text style={styles.datetime}>On {formatEventDate(postContent.dateTime)}</Text>
                ) : null}
                {postContent.note ? (
                    <Text style={styles.note}>{postContent.note}</Text>
                ) : null}
                <CountdownPill value={timeLeft} />
                <AttendanceRow
                    hasRequested={hasRequested}
                    onRequestJoin={handleRequest}
                    onOpenInvitees={() => setModalVisible(true)}
                    post={invite}
                />
                <PostActions
                    post={invite}
                    handleOpenComments={handleOpenComments}
                    onShare={onShare}
                    embeddedInShared={embeddedInShared}
                />
            </View>
            <InviteeModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                recipients={postContent.recipients}
                requests={postContent.requests}
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
            <NonOwnerOptions
                visible={viewerOptionsVisible}
                item={invite}
                onClose={() => setViewerOptionsVisible(false)}
                isFollowing={true}
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

});

export default InviteCard;
