import React, { useEffect, useState, useRef } from 'react';
import { View, Image, Text, Animated, TouchableWithoutFeedback, Dimensions, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView } from 'expo-video';
import { useSmartVideoPlayer } from '../../../utils/useSmartVideoPlayer';
import { isVideo } from '../../../utils/isVideo';
import { useLikeAnimations } from '../../../utils/LikeHandlers/LikeAnimationContext';
import { handleLikeWithAnimation as sharedHandleLikeWithAnimation } from '../../../utils/LikeHandlers';
import { handleEventOrPromoLike } from '../../../utils/LikeHandlers/promoEventLikes';
import { typeFromKind as promoEventKind, pickPostId } from '../../../utils/posts/postIdentity';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';

const screenWidth = Dimensions.get("window").width;
const DOUBLE_TAP_MS = 300;
const SINGLE_TAP_MS = 330;

const PhotoItem = ({
    photo,
    reviewItem,
    photoTapped,
    index,
    isInteractive = true,
    onOpenFullScreen,
}) => {
    const dispatch = useDispatch();
    const { getAnimation, registerAnimation } = useLikeAnimations(); // ✅ use context
    const [animation, setAnimation] = useState(null);
    const player = useSmartVideoPlayer(photo);
    const lastTapRef = useRef({});
    const timersRef = useRef({});
    const user = useSelector(selectUser);

    useEffect(() => {
        if (!reviewItem?._id) return;

        registerAnimation(reviewItem._id);
        const anim = getAnimation(reviewItem._id);
        if (anim) {
            setAnimation(anim);
        }
    }, [reviewItem?._id]);

    const handleLikeWithAnimation = (force = false) => {
        const animation = getAnimation(reviewItem._id);
        const resolvedPostId = pickPostId(reviewItem);
        const promoEventType =
            (reviewItem?.type && String(reviewItem.type).toLowerCase()) ||
            promoEventKind(reviewItem?.kind) ||
            (reviewItem?.__typename && String(reviewItem.__typename).toLowerCase());

        if (promoEventType === 'promotion' || promoEventType === 'event') {
            return handleEventOrPromoLike({
                postType: promoEventType || 'suggestion', // or pass 'event'/'promotion' explicitly if you know it
                kind: reviewItem.kind,
                postId: resolvedPostId,
                review: reviewItem,            
                user,
                animation,
                dispatch,
                lastTapRef,
                force,
            })
        } else {
            return sharedHandleLikeWithAnimation({
                postType: reviewItem.type,
                postId: resolvedPostId,
                review: reviewItem,
                user,
                animation,
                dispatch,
                lastTapRef,
                force,
            });
        }
    };

    const handleTap = () => {
        if (!isInteractive) {
            return;
        }

        const id =
            reviewItem?._id ||
            reviewItem?.id ||
            reviewItem?.postId ||
            reviewItem?.eventId ||
            reviewItem?.promotionId;

        if (!id) {
            console.warn('[handleTap] No valid ID found for reviewItem', reviewItem);
            return;
        }

        const now = Date.now();
        const last = lastTapRef.current[id] || 0;

        // Double tap branch
        if (now - last < DOUBLE_TAP_MS) {
            if (timersRef.current[id]) {
                clearTimeout(timersRef.current[id]);
                timersRef.current[id] = null;
            }

            lastTapRef.current[id] = 0;
            handleLikeWithAnimation(true); // shows overlay
            return;
        }

        // Single tap arm
        lastTapRef.current[id] = now;

        timersRef.current[id] = setTimeout(() => {
            if (lastTapRef.current[id] === now) {
                onOpenFullScreen?.(photo, index);
                lastTapRef.current[id] = 0;
            } else {
                console.log(`[handleTap -> timer] Ignored timer for id=${id}, lastTapRef changed`);
            }
            timersRef.current[id] = null;
        }, SINGLE_TAP_MS);
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
