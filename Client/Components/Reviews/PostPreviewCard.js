import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { Avatar } from '@rneui/base';
import { FontAwesome } from '@expo/vector-icons';
import { isVideo } from '../../utils/isVideo';
import { VideoView } from 'expo-video';
import { useSmartVideoPlayer } from '../../utils/useSmartVideoPlayer';
import { useSelector, useDispatch } from 'react-redux';
import { fetchLogo, selectLogo } from '../../Slices/PhotosSlice';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

const pinPic = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

export default function PostPreviewCard({ post }) {
    if (!post) return null;
    const dispatch = useDispatch();
    const logo = useSelector(selectLogo);

    const { fullName, profilePicUrl, rating, photos, reviewText, placeId, businessName, title } = post || {};
    const firstMedia = photos?.[0];
    const firstMediaUrl = photos?.[0]?.url;
    const player = useSmartVideoPlayer(photos?.[0]);
    const screenWidth = Dimensions.get('window').width;
    const displayPic = profilePicUrl || logo || profilePicPlaceholder;
    const displayName = fullName || businessName;
    const displayDescription = reviewText || title;
    const previewWidth = screenWidth - 65;
    const previewHeight = 160;

    useEffect(() => {
        if (placeId) {
            dispatch(fetchLogo(placeId));
        }
    }, [placeId]);

    console.log(post.title)

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Avatar
                    rounded
                    size={40}
                    source={{ uri: displayPic }}
                />
                <Text style={styles.name}>{displayName}</Text>
                {post.type === "check-in" && (
                    <Image source={{ uri: pinPic }} style={styles.pinPic} />
                )}
            </View>
            {post.type === "review" && (
                <View style={styles.ratingRow}>
                    {[...Array(5)].map((_, index) => (
                        <FontAwesome
                            key={index}
                            name={index < rating ? "star" : "star-o"}
                            size={16}
                            color="#FFD700"
                            style={{ marginRight: 2 }}
                        />
                    ))}
                </View>
            )}
            {firstMedia && (
                isVideo(firstMedia) ? (
                    <VideoView
                        player={player}
                        style={styles.media}
                        allowsPictureInPicture
                        nativeControls={false}
                        contentFit="cover"
                    />
                ) : (
                    <Image
                        source={{ uri: firstMediaUrl }}
                        style={styles.media}
                        resizeMode="cover"
                    />
                )
            )}
            {displayDescription ? (
                <Text numberOfLines={2} style={styles.reviewText}>
                    {displayDescription}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#f8f8f8',
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        borderColor: '#ccc',
        borderWidth: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    name: {
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    ratingRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    media: {
        width: '100%',
        height: 160,
        borderRadius: 8,
        marginBottom: 8,
    },
    reviewText: {
        fontSize: 14,
        color: '#333',
    },
    pinPic: {
        width: 16,
        height: 16,
        marginLeft: 5,
    },

});
