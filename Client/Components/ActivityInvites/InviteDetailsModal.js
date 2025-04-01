import React from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    ScrollView,
    Pressable,
} from 'react-native';
import { acceptInvite, rejectInvite } from '../../Slices/InvitesSlice';
import { PanGestureHandler } from 'react-native-gesture-handler';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { useDispatch } from 'react-redux';

const InviteDetailsModal = ({ visible, onClose, invite, userId, friends, onEdit, onDelete }) => {
    const dispatch = useDispatch();
    if (!invite) return null;
    const isSender = invite.senderId === userId;

    const isRecipient = invite.recipients?.some(
        (r) => r.userId?.toString() === userId && r.status === 'pending'
    );
    
    console.log(isRecipient)

    const categorizedRecipients = {
        confirmed: [],
        invited: [],
        declined: []
    };

    invite.recipients?.forEach((recipient) => {
        if (recipient.status === 'accepted') {
          categorizedRecipients.confirmed.push(recipient);
        } else if (recipient.status === 'pending') {
          categorizedRecipients.invited.push(recipient);
        } else if (recipient.status === 'declined') {
          categorizedRecipients.declined.push(recipient);
        }
    });

    const handleAccept = async () => {
        try {
          await dispatch(acceptInvite({ recipientId: userId, inviteId: invite._id }));
          onClose(); // Optionally close the modal after
        } catch (err) {
          console.error('Failed to accept invite:', err);
        }
      };
      
    const handleDecline = async () => {
        try {
          await dispatch(rejectInvite({ recipientId: userId, inviteId: invite._id }));
          onClose(); // Optionally close the modal after
        } catch (err) {
          console.error('Failed to reject invite:', err);
        }
    };
    //console.log(invite);

    const renderFriendPills = (list) => (
        <View style={styles.inviteesRow}>
          {list.map((recipient, index) => (
            <View key={recipient.userId || index} style={styles.pill}>
              <Image
                source={recipient.presignedProfileUrl
                  ? { uri: recipient.presignedProfileUrl }
                  : profilePicPlaceholder}
                style={styles.profilePic}
              />
              <Text style={styles.pillText}>
                {recipient.firstName || 'Unknown'}
              </Text>
            </View>
          ))}
        </View>
    );
      

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <PanGestureHandler onGestureEvent={() => { }} onEnded={onClose}>
                    <Pressable style={styles.modalContainer} onPress={() => { }}>
                        <View style={styles.notch} />
                        <ScrollView>
                            <Text style={styles.title}>Invite Details</Text>

                            {invite.senderName && (
                            <>
                                <Text style={styles.label}>From:</Text>
                                <Text style={styles.text}>{invite.senderName}</Text>
                            </>
                            )}
                            <Text style={styles.label}>Location:</Text>
                            <View style={styles.logoAndName}>
                                {invite?.business?.presignedPhotoUrl && (
                                    <Image source={{ uri: invite?.business?.presignedPhotoUrl }} style={styles.logoPic} />
                                )}
                                <Text style={styles.text}>
                                    {invite.business?.businessName || invite.placeId}
                                </Text>
                            </View>

                            <Text style={styles.label}>Date & Time:</Text>
                            <Text style={[styles.text, { marginTop: 10 }]}>
                                {new Date(invite.dateTime).toLocaleString()}
                            </Text>

                            {invite.note && (
                                <>
                                    <Text style={styles.label}>Note:</Text>
                                    <Text style={styles.note}>{invite.note}</Text>
                                </>
                            )}

                            {categorizedRecipients.confirmed.length > 0 && (
                                <>
                                    <Text style={styles.label}>Accepted:</Text>
                                    {renderFriendPills(categorizedRecipients.confirmed)}
                                </>
                            )}
                            {categorizedRecipients.invited.length > 0 && (
                                <>
                                    <Text style={styles.label}>Pending:</Text>
                                    {renderFriendPills(categorizedRecipients.invited)}
                                </>
                            )}
                            {categorizedRecipients.declined.length > 0 && (
                                <>
                                    <Text style={styles.label}>Declined:</Text>
                                    {renderFriendPills(categorizedRecipients.declined)}
                                </>
                            )}

                            {isRecipient && (
                                <View style={styles.actionsRow}>
                                    <TouchableOpacity style={styles.acceptButton} onPress={() => handleAccept()}>
                                        <Text style={styles.buttonText}>Accept</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.declineButton} onPress={() => handleDecline()}>
                                        <Text style={styles.buttonText}>Decline</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {isSender && (
                                <View style={styles.actionsRow}>
                                    <TouchableOpacity
                                        style={styles.editButton}
                                        onPress={() => onEdit(invite)}
                                    >
                                        <Text style={styles.buttonText}>Edit Invite</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.deleteButton}
                                        onPress={() => onDelete(invite)}
                                    >
                                        <Text style={styles.buttonText}>Delete Invite</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </ScrollView>
                    </Pressable>
                </PanGestureHandler>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#fff',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: '60%',
    },
    notch: {
        width: 50,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#ccc',
        alignSelf: 'center',
        marginBottom: 10,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    label: {
        fontSize: 14,
        color: '#777',
        marginTop: 10,
    },
    text: {
        fontSize: 16,
        fontWeight: '500',
        marginTop: 2,
    },
    note: {
        fontSize: 15,
        fontStyle: 'italic',
        color: '#444',
        marginTop: 4,
    },
    inviteesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e6f0ff',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 20,
        marginRight: 8,
        marginBottom: 8,
    },
    profilePic: {
        width: 24,
        height: 24,
        borderRadius: 12,
        marginRight: 6,
    },
    pillText: {
        fontSize: 14,
    },
    actionsRow: {
        flexDirection: 'column',
        justifyContent: 'space-around',
        marginTop: 20,
    },
    acceptButton: {
        backgroundColor: '#28a745',
        padding: 12,
        borderRadius: 8,
        flex: 0.45,
        alignItems: 'center',
        marginTop: 20,
    },
    declineButton: {
        backgroundColor: '#dc3545',
        padding: 12,
        borderRadius: 8,
        flex: 0.45,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    logoAndName: {
        flexDirection: 'row',
        marginTop: 10,
    },
    logoPic: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 10,
    },
    editButton: {
        backgroundColor: '#007bff',
        padding: 12,
        borderRadius: 8,
        flex: 0.9,
        alignItems: 'center',
    },
    deleteButton: {
        backgroundColor: '#dc3545',
        padding: 12,
        borderRadius: 8,
        flex: 0.9,
        alignItems: 'center',
        marginTop: 10,
    },    

});

export default InviteDetailsModal;
