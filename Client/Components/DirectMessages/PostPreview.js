import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import VideoThumbnail from '../Reviews/VideoThumbnail';

const PostPreview = ({ postPreview, onPress, onLongPress }) => {
    if (!postPreview) return null;
    const displayName = postPreview.business.businessName || postPreview.fullName;
    
    return (
        <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.9}>
            <View style={styles.wrapper}>
                <View style={styles.overlay}>
                    <Text style={styles.overlayText}>{displayName}'s {postPreview.postType}</Text>
                </View>
                {postPreview.mediaType === 'image' ? (
                    <Image
                        source={{ uri: postPreview.mediaUrl }}
                        style={styles.media}
                        resizeMode="cover"
                    />
                ) : (
                    <VideoThumbnail file={{ uri: postPreview.mediaUrl }} width={200} height={200} shouldPlay={false}/>
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        width: 200,
        height: 200,
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
        fontSize: 14,
    },
    media: {
        width: '100%',
        height: '100%',
    },
});

export default PostPreview;
