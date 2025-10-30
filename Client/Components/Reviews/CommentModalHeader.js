import React, { useRef, useMemo, useState, useEffect } from "react";
import { View, Text, Image, Animated, StyleSheet, Dimensions } from "react-native";
import dayjs from 'dayjs';
import { useNavigation } from "@react-navigation/native";
import PostActions from './PostActions/PostActions';
import PostUserInfo from "./CommentScreen/PostUserInfo";
import SharedPostContent from "./SharedPosts/SharedPostContent";
import VideoThumbnail from "./VideoThumbnail";
import PhotoFeed from "./Photos/PhotoFeed";
import RatingsButton from "./ReviewItem/RatingsButton";

const { width, height } = Dimensions.get('window');

const CommentModalHeader = ({
    review,
    timeLeft,
    formatEventDate,
    photoTapped,
    setIsPhotoListActive,
    sharedPost,
    onShare
}) => {
    const navigation = useNavigation();
    const renderItem = review?.original ?? review ?? {};
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const currentIndexRef = useRef(0);
    const currentPhoto = renderItem?.photos?.[currentPhotoIndex];
    const isInvite = renderItem?.type === "invite";
    const likeAnim = useRef({});
    const isShared = !!sharedPost || renderItem?.type === 'sharedPost';
    const hasTaggedUsers = Array.isArray(renderItem?.taggedUsers) && renderItem.taggedUsers.length > 0;
    const postOwnerPic = isShared
        ? (review?.user?.profilePicUrl || review?.profilePicUrl)                // sharer
        : isInvite
            ? (review?.sender?.profilePicUrl || review?.profilePicUrl)            // invite creator
            : (review?.profilePicUrl || review?.original?.profilePicUrl);
    const postOwnerName = isInvite && review?.sender?.firstName ? `${review?.sender?.firstName} ${review?.sender?.lastName}` : review?.fullName || `${review?.user?.firstName} ${review?.user?.lastName}`;
    const totalInvited = renderItem?.recipients?.length || 0;
    const dateTime = renderItem?.dateTime || renderItem?.date;
    
    const getTimeSincePosted = (date) => {
        return dayjs(date).fromNow(true);
    };

    const onClose = () => {
        navigation.goBack();
    };

    const { isLive, playbackUrl, vodUrl } = renderItem;

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
                    review={renderItem}
                    sharedPost={sharedPost}
                    getTimeSincePosted={getTimeSincePosted}
                />
                {sharedPost && review?.original && (
                    <SharedPostContent
                        sharedItem={renderItem}
                        photoTapped={photoTapped}
                        setIsPhotoListActive={setIsPhotoListActive}
                    />
                )}
                <Text style={styles.businessName}>
                    {renderItem?.type === "review" || isInvite ? renderItem?.businessName : ""}
                </Text>
                {(renderItem?.dateTime || renderItem?.date) && isInvite && (
                    <>
                        <Text style={styles.datetime}>On {formatEventDate(dateTime)}</Text>
                        <Text style={styles.note}>{renderItem.note}</Text>
                        <View style={styles.countdownContainer}>
                            <Text style={styles.countdownLabel}>Starts in:</Text>
                            <Text style={styles.countdownText}>{timeLeft}</Text>
                        </View>
                    </>
                )}
                {renderItem?.type === "review" && (
                    <RatingsButton post={review} />

                )}
                <Text style={styles.reviewText}>
                    {renderItem?.type === "review" ? renderItem?.reviewText : renderItem?.message}
                </Text>
            </View>
            <PhotoFeed
                post={review}
                scrollX={scrollX}
                currentIndexRef={currentIndexRef}
                setCurrentPhotoIndex={setCurrentPhotoIndex}
                photoTapped={photoTapped}
                onActiveChange={(active) => setIsPhotoListActive?.(active)} // keep your old behavior
            />
            {renderItem?.type === 'liveStream' && (
                <View style={{ marginTop: -50 }}>
                    <VideoThumbnail
                        file={fileForThumb}
                        width={width + 10}
                        height={height * .5}
                        likeAnim={likeAnim}
                        postItem={review}
                    />
                </View>
            )}
            {renderItem?.type === "check-in" && renderItem?.photos?.length === 0 && (
                <Image
                    source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }}
                    style={styles.pinIcon}
                />
            )}
            <View style={{ justifyContent: 'center' }}>
                <PostActions
                    post={review}
                    photo={currentPhoto}
                    isCommentScreen={true}
                    onShare={onShare}
                    embeddedInShared={false}
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

