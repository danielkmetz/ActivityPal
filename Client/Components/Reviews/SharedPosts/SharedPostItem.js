import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import StoryAvatar from '../../Stories/StoryAvatar';
import PostActions from '../PostActions/PostActions';
import ExpandableText from '../ExpandableText';
import PostOptionsMenu from '../PostOptionsMenu';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import SharedPostContent from './SharedPostContent';
import NonOwnerOptions from '../PostOptionsMenu/NonOwnerPostOptions';

export default function SharedPostItem({
    item,
    photoTapped,
    setPhotoTapped,
    handleOpenComments,
    handleEdit,
    handleDelete,
    onShare,
    embeddedInShared = false,
    ...rest
}) {
    const navigation = useNavigation();
    const user = useSelector(selectUser);
    const postOwner = `${item?.user?.firstName} ${item?.user?.lastName}`
    const postUserId = item?.user?.id || item?.user?._id;
    const isSender = postUserId === user?.id;
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);
    
    const navigateToProfile = () => {
        if (item.user?.id) {
            navigation.navigate('OtherUserProfile', { userId: item.user.id });
        }
    };

    return (
        <View style={styles.sharedCard}>
            <PostOptionsMenu
                dropdownVisible={dropdownVisible}
                setDropdownVisible={setDropdownVisible}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
                postData={item}
            />
            {/* Shared By Header */}
            <View style={styles.header}>
                <StoryAvatar profilePicUrl={item.user?.profilePicUrl} userId={item.user?.id} />
                <View style={styles.nameAndCaption}>
                    <Text>
                        <Text style={styles.name} onPress={navigateToProfile}>
                            {postOwner}
                        </Text>{" "}
                        <Text style={styles.sharedText}>shared a post</Text>
                    </Text>
                    {item.caption &&
                        <ExpandableText
                            text={item.caption}
                            maxLines={4}
                            textStyle={styles.caption}
                        />
                    }
                </View>
            </View>
            {!isSender && (
                <TouchableOpacity
                    onPress={() => setViewerOptionsVisible(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ position: 'absolute', top: 6, right: 6, padding: 6, zIndex: 5 }}
                >
                    <Text style={{ fontSize: 22, lineHeight: 22 }}>⋯</Text>
                </TouchableOpacity>
            )}
            {/* Render Shared Content */}
            <View style={{ marginTop: 10 }}>
                <SharedPostContent
                    sharedItem={item}
                    photoTapped={photoTapped}
                    setPhotoTapped={setPhotoTapped}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                    onShare={onShare}
                />
            </View>
            <PostActions
                post={item}
                handleOpenComments={handleOpenComments}
                onShare={onShare}
            />
            <NonOwnerOptions
                visible={viewerOptionsVisible}
                item={item}
                onClose={() => setViewerOptionsVisible(false)}
                isFollowing={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    sharedCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        marginBottom: 16,
        elevation: 3,
    },
    header: {
        padding: 10,
        flexDirection: 'row',
        marginVertical: 10,
    },
    nameAndCaption: {
        marginLeft: 10,
        flex: 1,
        justifyContent: 'center',
    },
    sharedText: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#555",
    },
    name: {
        fontSize: 18,
        fontWeight: "bold",
    },
    caption: {
        fontSize: 16,
        marginTop: 5,
    },
});
