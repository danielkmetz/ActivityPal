import React, { useState } from 'react';
import { View, Text, FlatList, Button, StyleSheet, TextInput, TouchableOpacity, Image } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { 
    fetchUserSuggestions,
    selectUserSuggestions, 
} from '../../Slices/friendsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { createNotification } from '../../Slices/NotificationsSlice';
import { 
    acceptFriendRequest, 
    declineFriendRequest ,
    selectFriendRequests,
    selectFriends,
    selectLoading,
    selectError,
    selectFriendsDetails,
    selectFriendRequestDetails,
} from '../../Slices/UserSlice';
import { setNotifications, selectNotifications } from '../../Slices/NotificationsSlice';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

export default function Friends() {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const friends = useSelector(selectFriends);
    const friendsDetails = useSelector(selectFriendsDetails);
    const friendRequests = useSelector(selectFriendRequests);
    const friendRequestsDetails = useSelector(selectFriendRequestDetails);
    const userSuggestions = useSelector(selectUserSuggestions);
    const status = useSelector(selectLoading);
    const error = useSelector(selectError);
    const notifications = useSelector(selectNotifications);
    const [activeTab, setActiveTab] = useState('friends'); // Toggle between "friends", "requests", and "search"
    const [searchQuery, setSearchQuery] = useState('');
    
    const handleAcceptRequest = async (senderId) => {
        try {
            await dispatch(acceptFriendRequest(senderId));
                
            await dispatch(createNotification({
                userId: senderId,  // The sender of the request gets notified
                type: 'friendRequestAccepted',
                message: `${user.firstName} ${user.lastName} accepted your friend request.`,
                relatedId: user.id, // The ID of the user who accepted the request
                typeRef: 'User'
            }));
        
            // Filter out the accepted friend request from notifications
            const updatedNotifications = notifications.filter(
                (notification) => !(notification.type === 'friendRequest' && notification.relatedId === senderId)
            );
        
            // Dispatch the updated notifications list
            dispatch(setNotifications(updatedNotifications));    
        } catch (error) {
            console.error('Error accepting friend request:', error);
        }
    };
        
    const handleDeclineRequest = async (senderId) => {
        try {
            await dispatch(declineFriendRequest(senderId));
        
            // Filter out the declined friend request from notifications
            const updatedNotifications = notifications.filter(
                (notification) => !(notification.type === 'friendRequest' && notification.relatedId === senderId)
            );
        
            dispatch(setNotifications(updatedNotifications));
        } catch (error) {
            console.error('Error declining friend request:', error);
        }
    };
        
    const navigateToOtherUserProfile = (user) => {
        navigation.navigate('OtherUserProfile', { user }); // Pass user data to the new screen
    };

    const renderFriendRequests = () => {
        return (
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>
                    Friend Requests: {friendRequestsDetails.length || 0}
                </Text>
                {friendRequestsDetails.length > 0 ? (
                    <FlatList
                        data={friendRequestsDetails}
                        keyExtractor={(item) => item._id}
                        renderItem={({ item }) => (
                            <View style={styles.requestContainer}>
                                <View style={styles.picAndName}>
                                    <Image 
                                        source={item.presignedProfileUrl ? 
                                            { uri: item.presignedProfileUrl} : 
                                            profilePicPlaceholder}
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
    };
    
    const renderFriendsList = () => (
        <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Friends: {friends?.length || 0}</Text>
            {friends?.length > 0 ? (
                <FlatList
                    data={friendsDetails}
                    keyExtractor={(item) => item._id}
                    renderItem={({ item }) => (
                        <View style={styles.friendContainer}>
                            <View style={styles.picAndName}>
                                <Image 
                                    source={item.presignedProfileUrl ? 
                                        { uri: item.presignedProfileUrl} : 
                                        profilePicPlaceholder}
                                    style={styles.profilePic}
                                />
                                <Text>{item.firstName} {item.lastName}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.suggestionContainer}
                                onPress={() => navigateToOtherUserProfile(item)}
                            >
                                <FontAwesome name="arrow-right" size={24} color="#007bff" />
                            </TouchableOpacity>
                        </View>
                    )}
                />
            ) : (
                <Text style={styles.emptyText}>No friends yet</Text>
            )}
        </View>
    );

    const renderSearch = () => {
        const handleSearchChange = (query) => {
            setSearchQuery(query);
    
            if (query.trim()) {
                dispatch(fetchUserSuggestions(query));
            }
        };
    
        return (
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Search Users</Text>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search for users..."
                    value={searchQuery}
                    onChangeText={handleSearchChange}
                />
                {userSuggestions?.length > 0 ? (
                    <FlatList
                        data={userSuggestions}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.suggestionContainer}
                                onPress={() => navigateToOtherUserProfile(item)}
                            >
                                <Text >{item.firstName} {item.lastName}</Text>
                                <FontAwesome name="arrow-right" size={24} color="#007bff" />
                            </TouchableOpacity>
                        )}
                    />
                ) : (
                    <Text style={styles.emptyText}>No users found</Text>
                )}
            </View>
        );
    };

    return (
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
                        title="Friend Requests"
                        onPress={() => setActiveTab('requests')}
                        color={activeTab === 'requests' ? '#007bff' : '#aaa'}
                    />
                    {friendRequests.received.length > 0 && (
                        <View style={styles.notificationBadge}>
                            <Text style={styles.notificationText}>{friendRequests.length}</Text>
                        </View>
                    )}
                </View>
                <Button
                    title="Search"
                    onPress={() => setActiveTab('search')}
                    color={activeTab === 'search' ? '#007bff' : '#aaa'}
                />
            </View>

            {activeTab === 'friends' && renderFriendsList()}
            {activeTab === 'requests' && renderFriendRequests()}
            {activeTab === 'search' && renderSearch()}
        </View>
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
    
});
