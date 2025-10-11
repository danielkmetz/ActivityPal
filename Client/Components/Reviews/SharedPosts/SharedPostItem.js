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
    animation,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    handleOpenComments,
    lastTapRef,
    handleEdit,
    handleDelete,
    following,
    followRequests,
    onShare,
    ...rest
}) {
    const navigation = useNavigation();
    const user = useSelector(selectUser);
    const postOwner = `${item?.user?.firstName} ${item?.user?.lastName}`
    const postUserId = item?.user?.id || item?.user?._id;
    const isSender = postUserId === user?.id;
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);
    const currentPhoto = item.photos?.[currentPhotoIndex];

    const navigateToProfile = () => {
        if (item.user?.id) {
            navigation.navigate('OtherUserProfile', { userId: item.user.id });
        }
    };

    const normalizeOpts = (optsOrForce) =>
        typeof optsOrForce === 'boolean' ? { force: optsOrForce } : (optsOrForce || {});

    const likeShareAnimateInner = (innerEntity, optsOrForce) => {
        const opts = normalizeOpts(optsOrForce);
        return handleLikeWithAnimation(item, { ...opts, animateTarget: innerEntity });
    };

    const likeShareAnimateOriginal = (_ignored, optsOrForce) => {
        const opts = normalizeOpts(optsOrForce);
        return handleLikeWithAnimation(item, { ...opts, animateTarget: item.original });
    };

    return (
        <View style={styles.sharedCard}>
            <PostOptionsMenu
                isSender={isSender}
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
            {!isSender &&  (
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
                    sharedItem={item.original}
                    animation={animation}
                    photoTapped={photoTapped}
                    toggleTaggedUsers={toggleTaggedUsers}
                    handleLikeWithAnimation={likeShareAnimateInner}
                    handleOpenComments={handleOpenComments}
                    lastTapRef={lastTapRef}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                    following={following}
                    followRequests={followRequests}
                    onShare={onShare}
                />
            </View>
            <View style={{ padding: 15 }}>
                <PostActions
                    item={item}
                    handleLikeWithAnimation={likeShareAnimateOriginal}
                    handleOpenComments={handleOpenComments}
                    toggleTaggedUsers={toggleTaggedUsers}
                    photo={currentPhoto}
                    onShare={onShare}
                />
            </View>
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
