import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import VideoThumbnail from '../Reviews/VideoThumbnail';

const PostPreview = ({
    postPreview,
    onPress,
    onLongPress,
    width = 200,
    height = 200,
    showOverlay = true,
    overlayText,
    showPostText = false,
}) => {
    if (!postPreview) return null;
    const displayName = postPreview?.business?.businessName || postPreview?.fullName;
    const label = overlayText || `${displayName}'s ${postPreview.postType}`;

    return (
        <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.9}>
            <View style={[styles.wrapper, { width, height }]}>
                {showOverlay && (
                    <View style={styles.overlay}>
                        <Text style={styles.overlayText}>{label}</Text>
                    </View>
                )}
                {postPreview.mediaType === 'image' ? (
                    <Image
                        source={{ uri: postPreview.mediaUrl }}
                        style={styles.media}
                        resizeMode="cover"
                    />
                ) : (
                    <VideoThumbnail file={{ uri: postPreview.mediaUrl }} width={width} height={height} shouldPlay={false} />
                )}
                {showPostText && postPreview?.reviewText && (
                    <View style={styles.reviewOverlay}>
                        <Text numberOfLines={2} ellipsizeMode="tail" style={styles.reviewText}>
                            {postPreview.reviewText}
                        </Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    overlay: {
        position: 'absolute',
        top: 0,
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        zIndex: 2,
    },
    overlayText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
        padding: 5,
    },
    media: {
        width: '100%',
        height: '100%',
    },
    reviewOverlay: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        zIndex: 2,
    },
    reviewText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '400',
        padding: 5
    },
});

export default PostPreview;
