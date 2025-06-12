import React, { useState } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Image, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { selectFollowing } from '../../Slices/friendsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { chooseUserToMessage, sendMessage } from '../../Slices/DirectMessagingSlice';

const SearchFollowingScreen = ({ route }) => {
    const { postId, postType } = route.params || {};
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const following = useSelector(selectFollowing) || [];
    const conversations = useSelector(state => state.directMessages.conversations || []);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const user = useSelector(selectUser);
    const buttonTitle = postId && postType ? "Send Post" : "Send Chat";

    const filteredUsers = following.filter(user => {
        const fullName = `${user?.firstName} ${user?.lastName}`.toLowerCase();
        return fullName.includes(searchQuery.toLowerCase());
    });

    const toggleUserSelection = (user) => {
        const isSelected = selectedUsers.find(u => u._id === user._id);
        if (isSelected) {
            setSelectedUsers(prev => prev.filter(u => u._id !== user._id));
        } else {
            setSelectedUsers(prev => [...prev, user]);
        }
    };

    const handleSendMessage = () => {
        const currentUserId = user.id;
        const allParticipantIds = [...selectedUsers.map(u => u._id), currentUserId].sort();

        const existingConversation = conversations.find(conv => {
            const participantIds = (conv.participants || [])
                .map(p => (typeof p === 'object' ? p._id : p)?.toString())
                .filter(Boolean)
                .sort();

            return (
                participantIds.length === allParticipantIds.length &&
                participantIds.every((id, index) => id === allParticipantIds[index])
            );
        });

        dispatch(chooseUserToMessage(selectedUsers)); // selected users only (not self)

        navigation.navigate('MessageThread', {
            conversationId: existingConversation?._id || null,
            participants: selectedUsers,
        });
    };

    const handleSendPostMessage = async () => {
        try {
            const currentUserId = user.id;
            const participantIds = [...selectedUsers.map(u => u._id), currentUserId].sort();

            // 1️⃣ Find existing conversation (from Redux state)
            let conversation = conversations.find(conv => {
                const convIds = (conv.participants || []).map(p =>
                    typeof p === 'object' ? p._id?.toString() : p?.toString()
                ).sort();

                return (
                    convIds.length === participantIds.length &&
                    convIds.every((id, idx) => id === participantIds[idx])
                );
            });

            // 2️⃣ Prepare payload
            const payload = {
                conversationId: conversation?._id || null,
                recipientIds: selectedUsers.map(u => u._id),
                messageType: 'post',
                content: '[post]', // fallback content
                post: {
                    postId,
                    postType,
                },
            };

            // 3️⃣ Dispatch the message
            const resultAction = await dispatch(sendMessage(payload));

            if (sendMessage.fulfilled.match(resultAction)) {
                Alert.alert('Success', 'Post sent!');
                navigation.goBack(); // ✅ Done
            } else {
                console.warn('❌ Post send failed:', resultAction.error?.message);
                Alert.alert('Error', 'Failed to send post.');
            }
        } catch (err) {
            console.error('❌ Failed to send post message:', err.message);
            Alert.alert('Error', 'Could not send the post.');
        }
    };

    const handleNavigation = () => {
        if (postId && postType) {
            handleSendPostMessage();
        } else {
            handleSendMessage();
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <TextInput
                    placeholder="Search followers..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={styles.searchInput}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearIcon}>
                        <Ionicons name="close-circle" size={20} color="#888" />
                    </TouchableOpacity>
                )}
            </View>
            <FlatList
                data={filteredUsers}
                keyExtractor={item => item._id}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.userRow} onPress={() => toggleUserSelection(item)}>
                        <Image
                            source={item.profilePicUrl ? { uri: item.profilePicUrl } : profilePicPlaceholder}
                            style={styles.avatar}
                        />
                        <Text style={styles.userName}>{item?.firstName} {item?.lastName}</Text>
                        <Ionicons
                            name={selectedUsers.find(u => u._id === item._id) ? 'checkbox' : 'square-outline'}
                            size={24}
                            color="#007AFF"
                            style={styles.checkbox}
                        />
                    </TouchableOpacity>
                )}
            />
            {selectedUsers.length > 0 && (
                <TouchableOpacity
                    style={styles.startButton}
                    onPress={handleNavigation}
                >
                    <Text style={styles.startButtonText}>{buttonTitle}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'white',
        padding: 16,
        marginTop: 120,
    },
    searchContainer: {
        position: 'relative',
        justifyContent: 'center',
    },
    searchInput: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 8,
        paddingRight: 32,
        marginBottom: 12,
    },
    clearIcon: {
        position: 'absolute',
        right: 10,
        top: 7,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 12,
    },
    userName: {
        fontSize: 16,
    },
    checkbox: {
        marginLeft: 'auto',
    },
    startButton: {
        backgroundColor: '#007AFF',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 20,
    },
    startButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
});

export default SearchFollowingScreen;
