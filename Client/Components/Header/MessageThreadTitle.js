import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import ProfilePic from '../Reviews/PostHeader/ProfilePic';

const MessageThreadTitle = ({ users = [] }) => {
    if (!Array.isArray(users) || users.length === 0) return null;

    if (users.length === 1) {
        const user = users[0];
        const fullName = `${user?.firstName} ${user?.lastName}`;
        return (
            <View style={styles.singleContainer}>
                <ProfilePic userId={user._id} profilePicUrl={user.profilePicUrl} />
                <Text style={styles.userText}>{fullName}</Text>
            </View>
        );
    }

    return (
        <View style={styles.groupContainer}>
            <View style={styles.groupAvatarsContainer}>
                {users.slice(0, 3).map((user, index) => (
                    <Image
                        key={user._id}
                        source={user.profilePicUrl ? { uri: user.profilePicUrl } : profilePicPlaceholder}
                        style={[
                            styles.groupAvatar,
                            { marginLeft: index === 0 ? 0 : -10 },
                        ]}
                    />
                ))}
            </View>
            <Text style={styles.userText} numberOfLines={1} ellipsizeMode="tail">
                {users.map(u => `${u?.firstName} ${u?.lastName}`).join(', ')}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    singleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    groupContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    groupAvatarsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
    },
    groupAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'white',
    },
    userText: {
        fontWeight: 'bold',
        fontSize: 24,
        marginLeft: 5,
        flexShrink: 1,
    },
});

export default MessageThreadTitle;
