import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    ScrollView,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Modal,
    Pressable,
    Animated,
    Dimensions,
    Image,
    Keyboard,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { closeSearchModal, searchModalStatus } from '../../Slices/ModalSlice';
import {
    addRecentSearch,
    fetchRecentSearches,
    deleteRecentSearch,
    clearAllRecentSearches,
    selectRecentSearches,
} from '../../Slices/RecentSearchesSlice';
import { fetchUserSuggestions, selectUserSuggestions, fetchSuggestedFriends, selectSuggestedUsers } from '../../Slices/friendsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { useNavigation } from '@react-navigation/native';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

export default function SearchModal() {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const followSuggestions = useSelector(selectSuggestedUsers)
    const isVisible = useSelector(searchModalStatus);
    const [searchQuery, setSearchQuery] = useState('');
    const suggestions = useSelector(selectUserSuggestions); // adjust selector
    const recentSearches = useSelector(selectRecentSearches);
    const user = useSelector(selectUser);
    const userId = user?.id;

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const widthAnim = useRef(new Animated.Value(0)).current;
    const typingTimeout = useRef(null);
    const screenWidth = Dimensions.get('window').width;

    useEffect(() => {
        if (isVisible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(widthAnim, {
                    toValue: screenWidth,
                    duration: 450,
                    useNativeDriver: false,
                }),
            ]).start();
        } else {
            fadeAnim.setValue(0);
            widthAnim.setValue(0);
        }
    }, [isVisible]);

    useEffect(() => {
        if (userId) {
            dispatch(fetchRecentSearches(userId));
            dispatch(fetchSuggestedFriends(userId));
        }
    }, [userId]);

    useEffect(() => {
        if (!searchQuery.trim()) return;

        if (typingTimeout.current) clearTimeout(typingTimeout.current);

        typingTimeout.current = setTimeout(() => {
            dispatch(fetchUserSuggestions(searchQuery));
        }, 300);
    }, [searchQuery]);

    const navigateToUserProfile = async (user) => {
        try {
            const alreadyExists = recentSearches.some(entry => entry.userId === user._id);

            const otherUserId = user?._id ? user._id : user.userId;

            // Only add if it doesn't exist
            if (!alreadyExists) {
                await dispatch(addRecentSearch({
                    userId: userId,
                    query: otherUserId
                }));
            }

            // Navigate first
            navigation.navigate('OtherUserProfile', { userId : otherUserId });

            // Close modal slightly after navigation to prevent race condition
            setTimeout(() => dispatch(closeSearchModal()), 100);
            setSearchQuery('');
        } catch (error) {
            console.error('❌ Error navigating to user profile:', error);
        }
    };

    const handleClose = () => {
        dispatch(closeSearchModal());
    };

    return (
        <Modal
            animationType="fade"
            visible={isVisible}
            transparent={true}
            onRequestClose={handleClose}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <Pressable style={styles.backdrop} onPress={handleClose}>
                    <Animated.View style={[styles.modalContainer, { opacity: fadeAnim }]}>
                        <Animated.View style={[styles.searchBar, { width: widthAnim }]}>
                            <TextInput
                                autoFocus
                                placeholder="Search..."
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                style={styles.searchInput}
                                placeholderTextColor="#aaa"
                            />
                            <TouchableOpacity onPress={handleClose}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </Animated.View>

                        <ScrollView style={styles.searchModal} keyboardShouldPersistTaps="handled">
                            {searchQuery.trim().length > 0 && suggestions.length > 0 && (
                                suggestions.map((user) => (
                                    <View style={styles.resultsRow}>
                                        <TouchableOpacity
                                            key={user._id}
                                            style={styles.userSuggestion}
                                            onPress={() => navigateToUserProfile(user)}
                                        >
                                            <Image
                                                source={user.presignedProfileUrl
                                                    ? { uri: user.presignedProfileUrl }
                                                    : profilePicPlaceholder}
                                                style={styles.profilePic}
                                            />
                                            <Text>{user?.firstName} {user?.lastName}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                            {recentSearches.length > 0 && (
                                <>
                                    <View style={styles.recentsHeader}>
                                        <Text style={styles.sectionTitle}>Recent Searches</Text>
                                        <TouchableOpacity onPress={() => dispatch(clearAllRecentSearches(userId))}>
                                            <Text style={{ color: 'red', fontSize: 12 }}>Clear All</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {recentSearches.map((entry) => (
                                        <View key={entry?.queryId} style={styles.recentSearchItem}>
                                            <TouchableOpacity
                                                style={styles.recentSearchInfo}
                                                onPress={() => navigateToUserProfile(entry)}
                                            >
                                                <Image
                                                    source={
                                                        entry?.profilePicUrl
                                                            ? { uri: entry?.profilePicUrl }
                                                            : profilePicPlaceholder
                                                    }
                                                    style={styles.profilePic}
                                                />
                                                <Text style={styles.fullNameText}>{entry?.fullName}</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={styles.deleteButton}
                                                onPress={() =>
                                                    dispatch(deleteRecentSearch({ userId, queryId: entry?.queryId }))
                                                }
                                            >
                                                <Text style={styles.deleteText}>×</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </>
                            )}
                            {followSuggestions.length > 0 && (
                                <>
                                    <Text style={[styles.sectionTitle, { marginTop: 30, }]}>Suggested Users</Text>
                                    {followSuggestions.map((user) => (
                                        <View key={user?._id} style={styles.recentSearchItem}>
                                            <TouchableOpacity
                                                style={[styles.recentSearchInfo, { justifyContent: 'space-between'}]}
                                                onPress={() => navigateToUserProfile(user)}
                                            >
                                                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                                    <Image
                                                        source={user.profilePicUrl ? { uri: user.profilePicUrl } : profilePicPlaceholder}
                                                        style={styles.profilePic}
                                                    />
                                                    <Text style={styles.fullNameText}>{user.firstName} {user.lastName}</Text>
                                                </View>
                                                <View style={styles.userInfoContainer}>
                                                    {user.mutualConnections?.length > 0 && (
                                                        <View style={styles.mutualInfoContainer}>
                                                            <View style={styles.avatarStack}>
                                                                {user.mutualConnections.slice(0, 3).map((mutual, index) => (
                                                                    <Image
                                                                        key={mutual._id}
                                                                        source={
                                                                            mutual.profilePicUrl
                                                                                ? { uri: mutual.profilePicUrl }
                                                                                : profilePicPlaceholder
                                                                        }
                                                                        style={[styles.mutualAvatar, { left: index * 15 }]}
                                                                    />
                                                                ))}
                                                            </View>
                                                            <Text style={styles.mutualText}>
                                                                Followed by {user.mutualConnections.slice(0, 3).map(m => m.firstName).join(', ')}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </>
                            )}
                        </ScrollView>
                    </Animated.View>
                </Pressable>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-start',
    },
    modalContainer: {
        flex: 1,
        marginTop: 70,
        backgroundColor: '#fff',
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#f0f0f0',
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: '#fff',
        borderRadius: 8,
        marginRight: 10,
    },
    cancelText: {
        fontSize: 14,
        color: '#007AFF',
    },
    searchModal: {
        padding: 15,
    },
    sectionTitle: {
        fontWeight: 'bold',
        fontSize: 14,
        marginVertical: 10,
    },
    userSuggestion: {
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderColor: '#eee',
        flexDirection: 'row',
        alignItems: 'center',
    },
    recentsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    recentSearch: {
        paddingVertical: 6,
        color: '#444',
    },
    profilePic: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 10,
    },
    recentSearchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderColor: '#eee',
    },
    recentSearchInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    deleteButton: {
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    deleteText: {
        fontSize: 16,
        color: '#888',
    },
    fullNameText: {
        fontSize: 14,
    },
    userInfoContainer: {
        flexDirection: 'column',
    },
    mutualInfoContainer: {
        marginLeft: 45,
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarStack: {
        flexDirection: 'row',
        position: 'absolute',
        left: -45,
        zIndex: 1,
        height: 30,
    },
    mutualAvatar: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: '#fff',
        position: 'absolute',
        zIndex: 10,
    },
    mutualText: {
        fontSize: 12,
        color: '#666',
    },
});

