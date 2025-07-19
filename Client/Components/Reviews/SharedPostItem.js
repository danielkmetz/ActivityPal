import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import StoryAvatar from '../Stories/StoryAvatar';
import CheckInItem from './CheckInItem'; // or ReviewItem, etc.
import ReviewItem from './ReviewItem';
import SuggestionItem from './SuggestionItem';
import InviteCard from './InviteCard';
import PostActions from './PostActions';
import ExpandableText from './ExpandableText';
import PostOptionsMenu from './PostOptionsMenu';
import { useSelector } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';

export default function SharedPostItem({
    item,
    animation,
    setLikedAnimations,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    handleLike,
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
    const postUserId = item?.user?.id || item?.user?._id;
    const isSender = postUserId === user?.id;
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const currentPhoto = item.photos?.[currentPhotoIndex];

    const navigateToProfile = () => {
        if (item.user?.id) {
            navigation.navigate('OtherUserProfile', { userId: item.user.id });
        }
    };

    const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

    console.log(item)

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
                            {fullName}
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
            {/* Render Shared Content */}
            <View style={{ marginTop: 10 }}>
                {item.original?.type === 'check-in' && (
                    <CheckInItem
                        item={item.original}
                        animation={animation}
                        setLikedAnimations={setLikedAnimations}
                        photoTapped={photoTapped}
                        toggleTaggedUsers={toggleTaggedUsers}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        handleLike={handleLikeWithAnimation}
                        handleOpenComments={handleOpenComments}
                        lastTapRef={lastTapRef}
                        handleDelete={handleDelete}
                        handleEdit={handleEdit}
                        following={following}
                        followRequests={followRequests}
                        onShare={onShare}
                        sharedPost={true}
                    />
                )}
                {item.original?.type === 'review' && (
                    <ReviewItem
                        item={item.original}
                        animation={animation}
                        photoTapped={photoTapped}
                        toggleTaggedUsers={toggleTaggedUsers}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        handleOpenComments={handleOpenComments}
                        lastTapRef={lastTapRef}
                        handleDelete={handleDelete}
                        handleEdit={handleEdit}
                        following={following}
                        followRequests={followRequests}
                        onShare={onShare}
                        sharedPost={true}
                    />
                )}
                {
                    item.original?.type === 'suggestion' ||
                    item.original.type == "promotion" ||
                    item.original.type === "promo" ||
                    item.original.type === "event"
                    && (
                        <SuggestionItem
                            suggestion={item.original}
                            onShare={onShare}
                            sharedPost={true}
                        />
                    )}
                {item.original?.type === 'invite' && (
                    <InviteCard
                        invite={item.original}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        handleOpenComments={handleOpenComments}
                        onShare={onShare}
                        sharedPost={true}
                    />
                )}
            </View>
            <View style={{ padding: 15 }}>
                <PostActions
                    item={item}
                    handleLikeWithAnimation={handleLikeWithAnimation}
                    handleOpenComments={handleOpenComments}
                    toggleTaggedUsers={toggleTaggedUsers}
                    photo={currentPhoto}
                    onShare={onShare}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    sharedCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 10,
        marginBottom: 16,
        elevation: 3,
    },
    header: {
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
    sharedHeaderWrapper: {
        paddingBottom: 10,
    },
    sharedBorder: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        padding: 10,
        marginBottom: 10,
    },
});
