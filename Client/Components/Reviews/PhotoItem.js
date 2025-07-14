import React, { useEffect, useState } from 'react';
import { View, Image, Text, Animated, TouchableWithoutFeedback, Dimensions, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView } from 'expo-video';
import { useSmartVideoPlayer } from '../../utils/useSmartVideoPlayer';
import { isVideo } from '../../utils/isVideo';
import { useLikeAnimations } from '../../utils/LikeHandlers/LikeAnimationContext';

const screenWidth = Dimensions.get("window").width;

const PhotoItem = ({
    photo,
    reviewItem,
    photoTapped,
    index,
    handleLikeWithAnimation,
    lastTapRef,
    isInteractive = true,
    onOpenFullScreen,
}) => {
    const { getAnimation, registerAnimation } = useLikeAnimations(); // ✅ use context
    const [animation, setAnimation] = useState(null);
    const player = useSmartVideoPlayer(photo);

    useEffect(() => {
        if (!reviewItem?._id) return;

        registerAnimation(reviewItem._id);
        const anim = getAnimation(reviewItem._id);
        if (anim) {
            setAnimation(anim);
        }
    }, [reviewItem?._id]);

    const handleTap = () => {
        if (!isInteractive) return;

        const now = Date.now();

        if (
            lastTapRef.current[reviewItem._id] &&
            now - lastTapRef.current[reviewItem._id] < 300
        ) {
            handleLikeWithAnimation(reviewItem);
            lastTapRef.current[reviewItem._id] = 0;
        } else {
            lastTapRef.current[reviewItem._id] = now;

            setTimeout(() => {
                if (lastTapRef.current[reviewItem._id] === now) {
                    onOpenFullScreen?.(photo, index);
                    lastTapRef.current[reviewItem._id] = 0;
                }
            }, 200);
        }
    };

    return (
        <View
            style={styles.photoContainer}
            pointerEvents={isInteractive ? "auto" : "none"}
        >
            <TouchableWithoutFeedback onPress={handleTap}>
                <View style={styles.videoWrapper}>
                    {isVideo(photo) ? (
                        <VideoView
                            player={player}
                            style={styles.photo}
                            allowsPictureInPicture
                            nativeControls={false}
                            contentFit="cover"
                        />
                    ) : (
                        <Image source={{ uri: photo.url || photo.uri || photo.bannerUrl }} style={styles.photo} />
                    )}

                    {isInteractive && animation && (
                        <Animated.View style={[styles.likeOverlay, { opacity: animation }]}>
                            <MaterialCommunityIcons name="thumb-up" size={80} color="#80E6D2" />
                        </Animated.View>
                    )}

                    {isInteractive && photoTapped === photo.photoKey &&
                        photo.taggedUsers?.map((taggedUser, index) => (
                            <View
                                key={index}
                                style={[
                                    styles.taggedLabel,
                                    { top: taggedUser.y, left: taggedUser.x },
                                ]}
                            >
                                <Text style={styles.tagText}>{taggedUser.fullName}</Text>
                            </View>
                        ))}
                </View>
            </TouchableWithoutFeedback>
        </View>
    );
};

const styles = StyleSheet.create({
    photoContainer: {
        width: screenWidth,
        height: 400, // Larger photo height
        marginBottom: 15,
    },
    photo: {
        width: screenWidth,
        height: 400, // Larger photo heigh
    },
    taggedLabel: {
        position: "absolute",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
    },
    tagText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "bold",
    },
    likeOverlay: {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: [{ translateX: -40 }, { translateY: -40 }], // Center the thumbs-up
        opacity: 0, // Initially hidden
    },
    videoWrapper: {
        width: screenWidth,
        alignSelf: 'center',
        backgroundColor: '#000', // prevents white flash
    },



})

export default PhotoItem;
