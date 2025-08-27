import React, { useRef, useMemo, useState, useEffect } from "react";
import { View, Text, Image, Animated, StyleSheet, Dimensions } from "react-native";
import dayjs from 'dayjs';
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useNavigation } from "@react-navigation/native";
import PostActions from './PostActions';
import PostUserInfo from "./CommentScreen/PostUserInfo";
import SharedPostContent from "./SharedPosts/SharedPostContent";
import VideoThumbnail from "./VideoThumbnail";
import { useDispatch } from "react-redux";
import PhotoFeed from "./Photos/PhotoFeed";

const { width, height } = Dimensions.get('window');

const CommentModalHeader = ({
    review,
    timeLeft,
    formatEventDate,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    lastTapRef,
    setIsPhotoListActive,
    sharedPost,
}) => {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const currentIndexRef = useRef(0);
    const currentPhoto = review.photos?.[currentPhotoIndex];
    const isInvite = review?.type === "invite";
    const likeAnim = useRef({});
    const isShared = !!sharedPost || review?.type === 'sharedPost';
    const photos = review?.photos || review?.media;
    const hasTaggedUsers = Array.isArray(review?.taggedUsers) && review.taggedUsers.length > 0;
    const postOwnerPic = isShared
        ? (review?.user?.profilePicUrl || review?.profilePicUrl)                // sharer
        : isInvite
            ? (review?.sender?.profilePicUrl || review?.profilePicUrl)            // invite creator
            : (review?.profilePicUrl || review?.original?.profilePicUrl);
    const postOwnerName = isInvite && review?.sender?.firstName ? `${review?.sender?.firstName} ${review?.sender?.lastName}` : review?.fullName || `${review?.user?.firstName} ${review?.user?.lastName}`;
    const totalInvited = review?.recipients?.length || 0;
    const dateTime = review?.dateTime || review?.date;
    const commentActionsMargin = sharedPost ? -50 : 10;

    const getTimeSincePosted = (date) => {
        return dayjs(date).fromNow(true);
    };

    const onClose = () => {
        navigation.goBack();
    };

    const onOpenFullScreen = (photo, index) => {
        navigation.navigate("FullScreenPhoto", {
            reviewId: review?._id,
            initialIndex: review.photos.findIndex(p => p._id === photo._id),
        })
    };

    const { isLive, playbackUrl, vodUrl } = review;

    const fileForThumb = useMemo(() => {
        const src = isLive ? playbackUrl : (vodUrl || playbackUrl);
        return src ? { type: 'hls', playbackUrl: src } : null;
    }, [isLive, playbackUrl, vodUrl]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (currentPhotoIndex !== currentIndexRef.current) {
                setCurrentPhotoIndex(currentIndexRef.current);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [currentPhotoIndex]);

    return (
        <View style={styles.header}>
            <View style={styles.headerText}>
                <PostUserInfo
                    onClose={onClose}
                    isInvite={isInvite}
                    hasTaggedUsers={hasTaggedUsers}
                    postOwnerPic={postOwnerPic}
                    postOwnerName={postOwnerName}
                    totalInvited={totalInvited}
                    review={review}
                    sharedPost={sharedPost}
                    getTimeSincePosted={getTimeSincePosted}
                />
                {sharedPost && review?.original && (
                    <SharedPostContent
                        sharedItem={review.original}
                        photoTapped={photoTapped}
                        toggleTaggedUsers={toggleTaggedUsers}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        lastTapRef={lastTapRef}
                        setIsPhotoListActive={setIsPhotoListActive}
                        onOpenFullScreen={(photo, index) => {
                            navigation.navigate("FullScreenPhoto", {
                                reviewId: review.original?._id,
                                initialIndex: index,
                            });
                        }}
                    />
                )}
                <Text style={styles.businessName}>
                    {review?.type === "review" || isInvite ? review?.businessName : ""}
                </Text>
                {(review?.dateTime || review?.date) && isInvite && (
                    <>
                        <Text style={styles.datetime}>On {formatEventDate(dateTime)}</Text>
                        <Text style={styles.note}>{review.note}</Text>
                        <View style={styles.countdownContainer}>
                            <Text style={styles.countdownLabel}>Starts in:</Text>
                            <Text style={styles.countdownText}>{timeLeft}</Text>
                        </View>
                    </>
                )}
                <View style={styles.rating}>
                    {Array.from({ length: review?.rating }).map((_, index) => (
                        <MaterialCommunityIcons
                            key={index}
                            name="star"
                            size={20}
                            color="gold"
                        />
                    ))}
                </View>
                <Text style={styles.reviewText}>
                    {review?.type === "review" ? review?.reviewText : review?.message}
                </Text>
            </View>
            {!!photos?.length && (
                <PhotoFeed
                    media={photos}
                    scrollX={scrollX}
                    currentIndexRef={currentIndexRef}
                    setCurrentPhotoIndex={setCurrentPhotoIndex}
                    reviewItem={review}
                    photoTapped={photoTapped}
                    handleLikeWithAnimation={handleLikeWithAnimation}
                    lastTapRef={lastTapRef}
                    onOpenFullScreen={onOpenFullScreen}
                    onActiveChange={(active) => setIsPhotoListActive?.(active)} // keep your old behavior
                />
            )}
            {review?.type === 'liveStream' && (
                <View style={{ marginTop: -50 }}>
                    <VideoThumbnail
                        file={fileForThumb}
                        width={width + 10}
                        height={height * .5}
                        likeAnim={likeAnim}
                        reviewItem={review}
                        onDoubleTap={() => handleLikeWithAnimation({
                            postType: 'liveStream',
                            postId: review?._id,
                            review,
                            user,
                            animation: likeAnim,     // 👈 drives the overlay
                            lastTapRef,
                            dispatch,
                            force: true,             // optional if you want immediate burst on any tap here
                        })}
                    />
                </View>
            )}
            {review?.type === "check-in" && review?.photos?.length === 0 && (
                <Image
                    source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }}
                    style={styles.pinIcon}
                />
            )}
            <View style={{ marginTop: commentActionsMargin, justifyContent: 'center' }}>
                <PostActions
                    item={review}
                    photo={currentPhoto}
                    handleLikeWithAnimation={handleLikeWithAnimation}
                    isCommentScreen={true}
                />
            </View>
        </View>
    );
};

export default CommentModalHeader;

const styles = StyleSheet.create({
    header: {
        marginTop: 45,
        backgroundColor: '#fff',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        justifyContent: 'center',
    },
    headerText: {
        padding: 10,
    },
    businessName: {
        fontSize: 16,
        fontWeight: "bold",
        color: '#555',
    },
    datetime: {
        fontSize: 14,
        color: '#666',
    },
    note: {
        fontStyle: 'italic',
        color: '#555',
        marginTop: 10,
    },
    countdownContainer: {
        marginTop: 15,
        padding: 10,
        backgroundColor: '#e6f0ff',
        borderRadius: 8,
        alignItems: 'center',
    },
    countdownLabel: {
        fontSize: 13,
        color: '#666',
    },
    countdownText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#007bff',
    },
    rating: {
        fontSize: 14,
        flexDirection: 'row',
    },
    reviewText: {
        fontSize: 15,
        color: '#333',
        marginBottom: 10,
    },
    pinIcon: {
        width: 50,
        height: 50,
        alignSelf: 'center',
        marginBottom: 10,
    },
});

