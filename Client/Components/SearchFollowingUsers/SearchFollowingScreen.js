import React, { useState } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { selectFollowing } from '../../Slices/friendsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { chooseUserToMessage } from '../../Slices/DirectMessagingSlice';

const SearchFollowingScreen = () => {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const following = useSelector(selectFollowing) || [];
    const conversations = useSelector(state => state.directMessages.conversations || []);
    const [searchQuery, setSearchQuery] = useState('');
    const user = useSelector(selectUser);

    const filteredUsers = following.filter(user => {
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        return fullName.includes(searchQuery.toLowerCase());
    });

    const handleSelectUser = (item) => {
        const conversationWithUser = conversations.find(
            conv => conv.otherUser?._id === item._id
        );

        dispatch(chooseUserToMessage(item));

        if (conversationWithUser) {
            navigation.navigate('MessageThread', {
                conversationId: conversationWithUser._id,
                otherUser: conversationWithUser.otherUser,
            });
        } else {
            navigation.navigate('MessageThread', {
                conversationId: null,
                otherUser: item,
            });
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
                    <TouchableOpacity style={styles.userRow} onPress={() => handleSelectUser(item)}>
                        <Image
                            source={item.profilePicUrl ? { uri: item.profilePicUrl } : profilePicPlaceholder}
                            style={styles.avatar}
                        />
                        <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
                    </TouchableOpacity>
                )}
            />
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
});

export default SearchFollowingScreen;
