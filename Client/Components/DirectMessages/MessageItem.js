import React, { useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import VideoThumbnail from '../Reviews/VideoThumbnail';
import PostPreview from './PostPreview';
import { selectProfilePic } from '../../Slices/PhotosSlice';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';

const MessageItem = ({
    item,
    onLongPress,
}) => {

    if (item.type === 'date') {
        return (
            <View style={styles.dateHeader}>
                <Text style={styles.dateText}>{item.label}</Text>
            </View>
        );
    };

    const navigation = useNavigation();
    const user = useSelector(selectUser);
    const userId = user?.id;
    const profilePicObject = useSelector(selectProfilePic);
    const currentUserProfilePic = profilePicObject?.url;
    const lastTapRef = useRef({});
    const [likedAnimations, setLikedAnimations] = useState({});

    const isCurrentUser = item.senderId === userId;
    const profilePic = isCurrentUser ? currentUserProfilePic : item.participants?.profilePicUrl;
    const hasMedia = item.media?.url;
    const mediaType = item.media?.mediaType;

    const handleLongPress = () => {
        if (isCurrentUser) onLongPress(item);
    };

    return (
        <View style={[styles.messageRow, isCurrentUser ? styles.rowReverse : styles.row]}>
            {!isCurrentUser && (
                <Image
                    source={profilePic ? { uri: profilePic } : profilePicPlaceholder}
                    style={styles.avatar}
                />
            )}
            <TouchableOpacity onLongPress={handleLongPress}>
                <View
                    style={[
                        styles.messageBubble,
                        item.messageType === 'post' && item.postPreview
                            ? styles.noBubble
                            : isCurrentUser
                                ? styles.sent
                                : styles.received,
                    ]}
                >
                    {hasMedia && (
                        <View style={styles.messageMediaWrapper}>
                            {mediaType === 'image' ? (
                                <Image
                                    source={{ uri: item.media.url }}
                                    style={styles.messageMedia}
                                    resizeMode="cover"
                                />
                            ) : (
                                <VideoThumbnail file={item.media} width={200} height={200} shouldPlay={false} />
                            )}
                        </View>
                    )}

                    {item.messageType === 'post' && item.postPreview ? (
                        <PostPreview
                            postPreview={item.postPreview}
                            onLongPress={handleLongPress}
                            onPress={() =>
                                navigation.navigate("CommentScreen", {
                                    reviewId: item.postPreview.postId,
                                    initialIndex: 0,
                                    lastTapRef,
                                    likedAnimations,
                                    setLikedAnimations,
                                    taggedUsersByPhotoKey: item.postPreview.taggedUsersByPhotoKey || {},
                                })
                            }
                        />
                    ) : (
                        !!item.content && item.content !== '[media]' && (
                            <Text style={styles.messageText}>{item.content}</Text>
                        )
                    )}
                </View>
            </TouchableOpacity>
            {isCurrentUser && (
                <Image
                    source={profilePic ? { uri: profilePic } : profilePicPlaceholder}
                    style={styles.avatar}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    messageRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginVertical: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    rowReverse: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginHorizontal: 6,
    },
    messageBubble: {
        padding: 10,
        borderRadius: 10,
        marginVertical: 4,
    },
    sent: {
        backgroundColor: '#00cc99',
        alignSelf: 'flex-end',
    },
    received: {
        backgroundColor: '#eee',
        alignSelf: 'flex-start',
    },
    messageText: {
        color: '#000',
    },
    messageMediaWrapper: {
        marginBottom: 4,
        borderRadius: 10,
        overflow: 'hidden',
    },
    messageMedia: {
        width: 200,
        height: 200,
        borderRadius: 10,
    },
    dateHeader: {
        alignItems: 'center',
        marginVertical: 10,
    },
    dateText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#888',
    },
    noBubble: {
        backgroundColor: 'transparent',
        padding: 0,
        marginVertical: 6,
    },
});

export default MessageItem;
