import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ScrollView, Button, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import {
    fetchUserSuggestions,
    selectUserSuggestions,
    fetchSuggestedFriends,
    approveFollowRequest,
    declineFollowRequest,
    selectFollowRequests,
    selectFollowing,
    selectError,
    selectStatus,
    fetchFollowersAndFollowing,
    selectFollowers,
    selectFriends,
} from '../../Slices/friendsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { createNotification } from '../../Slices/NotificationsSlice';
import { setNotifications, selectNotifications } from '../../Slices/NotificationsSlice';
import { selectInvites, fetchInvites, deleteInvite } from '../../Slices/InvitesSlice';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import InviteModal from '../ActivityInvites/InviteModal';
import InviteDetailsModal from '../ActivityInvites/InviteDetailsModal';
import { setUserAndFriendsReviews, selectUserAndFriendsReviews } from '../../Slices/ReviewsSlice';
import FriendSearchModal from './FriendsSearchModal';
import UserSearchCard from './UserSearchCard';
import FriendsCard from './FriendsCard';

export default function Friends() {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const friends = useSelector(selectFriends);
    const followRequests = useSelector(selectFollowRequests);
    const userSuggestions = useSelector(selectUserSuggestions);
    const invites = useSelector(selectInvites) || [];
    const status = useSelector(selectStatus);
    const error = useSelector(selectError);
    const notifications = useSelector(selectNotifications);
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const [activeTab, setActiveTab] = useState('friends'); // Toggle between "friends", "requests", and "search"
    const [searchQuery, setSearchQuery] = useState('');
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedInvite, setSelectedInvite] = useState(null);
    const [inviteToEdit, setInviteToEdit] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [showFriendSearchModal, setShowFriendSearchModal] = useState(false);

    useEffect(() => {
        if (user) {
            dispatch(fetchInvites(user?.id));
            dispatch(fetchSuggestedFriends(user?.id));
            dispatch(fetchFollowersAndFollowing(user?.id));
        }
    }, [user]);

    const handleAcceptRequest = async (senderId) => {
        try {
            await dispatch(approveFollowRequest(senderId));

            await dispatch(createNotification({
                userId: senderId,  // The sender of the request gets notified
                type: 'followRequestAccepted',
                message: `${user.firstName} ${user.lastName} accepted your follow request.`,
                relatedId: user.id, // The ID of the user who accepted the request
                typeRef: 'User'
            }));

            // Filter out the accepted friend request from notifications
            const updatedNotifications = notifications.filter(
                (notification) => !(notification.type === 'followRequest' && notification.relatedId === senderId)
            );

            // Dispatch the updated notifications list
            dispatch(setNotifications(updatedNotifications));
        } catch (error) {
            console.error('Error accepting friend request:', error);
        }
    };

    const handleDeclineRequest = async (senderId) => {
        try {
            await dispatch(declineFollowRequest(senderId));

            // Filter out the declined friend request from notifications
            const updatedNotifications = notifications.filter(
                (notification) => !(notification.type === 'followRequest' && notification.relatedId === senderId)
            );

            dispatch(setNotifications(updatedNotifications));
        } catch (error) {
            console.error('Error declining friend request:', error);
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
                            dispatch(setUserAndFriendsReviews(
                                userAndFriendsReviews.filter(item => item._id !== invite._id)
                            ));

                            // ✅ Close out UI
                            setIsEditing(false);
                            setInviteToEdit(null);
                            setShowDetailsModal(false);

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

    const navigateToOtherUserProfile = (user) => {
        navigation.navigate('OtherUserProfile', { user }); // Pass user data to the new screen
    };

    const renderFriendRequests = () => (
        <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>
                Follow Requests: {followRequests.length || 0}
            </Text>
            {friends.length > 0 ? (
                <FlatList
                    data={friends}
                    keyExtractor={(item) => item._id}
                    renderItem={({ item }) => (
                        <View style={styles.requestContainer}>
                            <View style={styles.picAndName}>
                                <Image
                                    source={item.presignedProfileUrl
                                        ? { uri: item.presignedProfileUrl }
                                        : profilePicPlaceholder}
                                    style={styles.profilePic}
                                />
                                <Text>{`${item.firstName} ${item.lastName}`}</Text>
                            </View>
                            <View style={styles.buttonGroup}>
                                <TouchableOpacity
                                    onPress={() => handleAcceptRequest(item._id)}
                                    style={styles.acceptButton}
                                >
                                    <Text style={styles.acceptButtonText}>Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleDeclineRequest(item._id)}
                                    style={styles.declineButton}
                                >
                                    <Text style={styles.declineButtonText}>Decline</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                />
            ) : (
                <Text style={styles.emptyText}>No friend requests</Text>
            )}
        </View>
    );

    const renderFriendsList = () => (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <FriendsCard
              friends={friends}
              friendsDetails={friends}
              onSearchPress={() => setShowFriendSearchModal(true)}
              onFriendPress={(user) => navigateToOtherUserProfile(user)}
            />
          </ScrollView>
        </View>
      );
      

    const renderEventInvites = () => {
        const sentInvites = invites.filter(invite => invite.senderId === user.id);

        const receivedInvites = invites.filter(invite =>
            invite.senderId !== user.id &&
            invite.recipients?.some(r => r.userId?.toString() === user.id && r.status === 'pending')
        );

        const acceptedInvites = invites.filter(invite =>
            invite.recipients?.some(r => r.userId?.toString() === user.id && r.status === 'accepted')
        );

        const renderInviteRow = (invite) => (
            <View key={invite._id} style={styles.inviteItem}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.inviteText}>
                        {invite.business?.businessName || 'Unknown Location'}
                    </Text>
                    <Text style={styles.inviteDateTime}>
                        {new Date(invite.dateTime).toLocaleString()}
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.detailsButton}
                    onPress={() => {
                        setSelectedInvite(invite);
                        setShowDetailsModal(true);
                    }}
                >
                    <Text style={styles.detailsButtonText}>Details</Text>
                </TouchableOpacity>
            </View>
        );

        return (
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Vybe Requests:</Text>

                <Text style={styles.subheading}>Received</Text>
                {receivedInvites.length > 0
                    ? receivedInvites.map(renderInviteRow)
                    : <Text style={styles.emptyText}>No received invites</Text>
                }

                <Text style={styles.subheading}>Accepted</Text>
                {acceptedInvites.length > 0
                    ? acceptedInvites.map(renderInviteRow)
                    : <Text style={styles.emptyText}>No accepted invites</Text>
                }

                <Text style={styles.subheading}>Sent</Text>
                {sentInvites.length > 0
                    ? sentInvites.map(renderInviteRow)
                    : <Text style={styles.emptyText}>No sent invites</Text>
                }

                <InviteDetailsModal
                    visible={showDetailsModal}
                    onClose={() => {
                        setSelectedInvite(null);
                        setShowDetailsModal(false);
                    }}
                    invite={selectedInvite}
                    userId={user?.id}
                    onEdit={(invite) => {
                        setInviteToEdit(invite);
                        setShowDetailsModal(false);
                        setShowInviteModal(true);
                        setIsEditing(true);
                    }}
                    onDelete={handleDelete}
                    setShowDetailsModal={setShowDetailsModal}
                />
            </View>
        );
    };

    const renderSearch = () => {
        const handleSearchChange = (query) => {
          setSearchQuery(query);
          if (query.trim()) dispatch(fetchUserSuggestions(query));
        };
      
        return (
          <UserSearchCard
            query={searchQuery}
            onChangeQuery={handleSearchChange}
            results={userSuggestions}
            onUserSelect={navigateToOtherUserProfile}
          />
        );
    };  

    return (
        <>
            <View style={styles.container}>
                {status === 'loading' && <Text>Loading...</Text>}
                {status === 'failed' && <Text style={styles.errorText}>Error: {error}</Text>}

                <View style={styles.tabContainer}>
                    <Button
                        title="Your Friends"
                        onPress={() => setActiveTab('friends')}
                        color={activeTab === 'friends' ? '#007bff' : '#aaa'}
                    />
                    <View style={styles.friendRequestTab}>
                        <Button
                            title="Requests"
                            onPress={() => setActiveTab('requests')}
                            color={activeTab === 'requests' ? '#007bff' : '#aaa'}
                        />
                        {followRequests.received.length > 0 && (
                            <View style={styles.notificationBadge}>
                                <Text style={styles.notificationText}>{followRequests.length}</Text>
                            </View>
                        )}
                    </View>
                    <Button
                        title="Search"
                        onPress={() => setActiveTab('search')}
                        color={activeTab === 'search' ? '#007bff' : '#aaa'}
                    />
                    <Button
                        title="+ Invite"
                        onPress={() => {
                            // 👇 open your invite modal or navigate to invite creation screen
                            setShowInviteModal(true); // or navigate('CreateInvite')
                        }}
                        color="#28a745"
                    />
                </View>

                {activeTab === 'friends' && renderFriendsList()}
                {activeTab === 'requests' && (
                    <>
                        {renderFriendRequests()}
                        {renderEventInvites()}
                    </>
                )}
                {activeTab === 'search' && renderSearch()}
            </View>
            <InviteModal
                visible={showInviteModal}
                onClose={() => setShowInviteModal(false)}
                friends={friends}
                setShowInviteModal={setShowInviteModal}
                initialInvite={inviteToEdit}
                setInviteToEdit={setInviteToEdit}
                isEditing={isEditing}
                setIsEditing={setIsEditing}
            />

            <FriendSearchModal
                visible={showFriendSearchModal}
                onClose={() => setShowFriendSearchModal(false)}
                friends={friends}
                onSelectFriend={(user) => navigateToOtherUserProfile(user)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        backgroundColor: '#f8f8f8',
        flex: 1,
        marginTop: 135,
    },
    tabContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 16,
    },
    sectionContainer: {
        marginBottom: 16,
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    requestContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    friendContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    buttonGroup: {
        flexDirection: 'row',
        gap: 8,
    },
    searchInput: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 8,
        marginBottom: 16,
    },
    emptyText: {
        color: '#aaa',
        textAlign: 'center',
        marginTop: 8,
    },
    errorText: {
        color: 'red',
        textAlign: 'center',
        marginBottom: 16,
    },
    suggestionContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    picAndName: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    profilePic: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 10,
    },
    acceptButton: {
        backgroundColor: '#007bff', // Blue color
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 5,
        alignItems: 'center',
        marginRight: 0,
    },
    acceptButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    declineButton: {
        backgroundColor: '#6c757d', // Gray color
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 5,
        alignItems: 'center',
    },
    declineButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    friendRequestTab: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    notificationBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: 'red',
        borderRadius: 10,
        width: 10,
        height: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },

    notificationText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    invitesCard: {
        marginTop: 20,
        padding: 12,
        backgroundColor: '#f1f9ff',
        borderRadius: 8,
    },

    inviteItem: {
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        paddingBottom: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },

    inviteText: {
        fontSize: 15,
        color: '#333',
    },

    inviteNote: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
        fontStyle: 'italic',
    },

    inviteDateTime: {
        fontSize: 13,
        color: '#999',
        marginTop: 4,
    },
    subheading: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 10,
        color: '#444',
    },
    detailsButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: '#007bff',
        borderRadius: 5,
        alignSelf: 'center',
        marginLeft: 12,
    },
    detailsButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
});
