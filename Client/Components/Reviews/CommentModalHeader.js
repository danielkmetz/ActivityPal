import React, { useRef, useMemo, useState, useEffect } from "react";
import { View, Text, Image, Animated, StyleSheet, Dimensions, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Avatar } from "react-native-paper";
import dayjs from "dayjs";
import TaggedUsersLine from "./PostHeader/TaggedUsersLine";
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { useNavigation } from "@react-navigation/native";
import PostActions from './PostActions/PostActions';
import SharedPostContent from "./SharedPosts/SharedPostContent";
import VideoThumbnail from "./VideoThumbnail";
import PhotoFeed from "./Photos/PhotoFeed";
import RatingsButton from "./ReviewItem/RatingsButton";
import BusinessLink from "./PostHeader/BusinessLink";


const { width, height } = Dimensions.get('window');
const pinPic = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

const CommentModalHeader = ({
    review,
    timeLeft,
    formatEventDate,
    photoTapped,
    setPhotoTapped,
    setIsPhotoListActive,
    onShare
}) => {
    const navigation = useNavigation();
    const renderItem = review?.original ?? review ?? {};
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const currentIndexRef = useRef(0);
    const currentPhoto = renderItem?.photos?.[currentPhotoIndex];
    const isInvite = review?.type === "invite";
    const likeAnim = useRef({})
    const dateTime = renderItem?.dateTime || renderItem?.date || review?.details?.dateTime;
    const postType = review?.type || review?.postType;
    const postText = review?.reviewText || review?.message || review?.caption;
    const isShared = review?.type === 'sharedPost' || review?.postType === 'sharedPost' || !!review?.original;
    const { isLive, playbackUrl, vodUrl } = renderItem;
    const details = renderItem?.details;
    const owner = renderItem?.owner || renderItem?.sender 
    const totalInvited = Array.isArray(details?.recipients) ? details.recipients.length : 0;

    const authorPic = (() => {
        if (isShared) return owner?.profilePicUrl || review?.profilePicUrl;
        if (isInvite) return owner?.profilePicUrl || review?.profilePicUrl;
        return owner?.profilePicUrl || review?.profilePicUrl;
    })();

    const onPressUser = (userId) => {
        if (!userId) return;

        navigation.navigate('OtherUserProfile', { userId });
    };

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
                <View style={styles.userRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <MaterialCommunityIcons name="chevron-left" size={26} color="#000" />
                    </TouchableOpacity>
                    <Avatar.Image
                        size={48}
                        source={authorPic ? { uri: authorPic } : profilePicPlaceholder}
                        style={{ backgroundColor: '#ccc', marginRight: 10 }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <TaggedUsersLine
                            post={review}
                            onPressUser={onPressUser}
                            // For check-ins, show "at {business}" even when no tags:
                            includeAtWithBusiness={postType === 'check-in'}
                            showAtWhenNoTags={postType === 'check-in'}
                            prefix=" is with "
                            containerStyle={{ paddingHorizontal: 0, paddingVertical: 0 }}
                            nameStyle={{ fontSize: 16, fontWeight: 'bold', color: '#222' }}
                            connectorStyle={{ fontSize: 15, fontWeight: 'bold', color: '#555' }}
                        // Optionally add a tiny accessory near the business name:
                        // renderBusinessAccessory={() => <Image source={{ uri: smallPin }} style={{ width: 14, height: 14, marginLeft: 6 }} />}
                        />
                        {/* tiny subline(s) below the tagged line */}
                        {!!review?.date && (
                            <Text style={styles.reviewDate}>
                                {dayjs(review.date).fromNow(true)} ago
                            </Text>
                        )}
                        {isShared && (
                            <Text style={styles.sharedNote}>shared a post</Text>
                        )}
                        {isInvite && (
                            <Text style={styles.inviteNote}>
                                invited {totalInvited} friend{totalInvited === 1 ? '' : 's'} to a Vybe
                            </Text>
                        )}
                    </View>
                </View>
                {postType !== 'check-in' && postType !== 'sharedPost' && (
                    <View style={{ marginTop: 10, marginBottom: 5 }}>
                        <BusinessLink post={renderItem} />
                    </View>
                )}
                {dateTime && isInvite && (
                    <>
                        <Text style={styles.datetime}>On {formatEventDate(dateTime)}</Text>
                        <Text style={styles.note}>{renderItem.note}</Text>
                        <View style={styles.countdownContainer}>
                            <Text style={styles.countdownLabel}>Starts in:</Text>
                            <Text style={styles.countdownText}>{timeLeft}</Text>
                        </View>
                    </>
                )}
                {review?.type === "review" && (
                    <RatingsButton post={review} />

                )}
                <Text style={styles.reviewText}>{postText}</Text>
                {isShared && (
                    <SharedPostContent
                        sharedItem={review}
                        photoTapped={photoTapped}
                        setIsPhotoListActive={setIsPhotoListActive}
                    />
                )}
            </View>
            {!isShared && (
                <PhotoFeed
                    post={review}
                    scrollX={scrollX}
                    currentIndexRef={currentIndexRef}
                    setCurrentPhotoIndex={setCurrentPhotoIndex}
                    photoTapped={photoTapped}
                    setPhotoTapped={setPhotoTapped}
                    onActiveChange={(active) => setIsPhotoListActive?.(active)} // keep your old behavior
                />
            )}
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
            {review?.type === "check-in" && renderItem?.photos?.length === 0 && (
                <Image
                    source={{ uri: pinPic }}
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
        marginVertical: 10,
    },
    pinIcon: {
        width: 50,
        height: 50,
        alignSelf: 'center',
        marginBottom: 30,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        padding: 5,
        marginRight: 4,
    },
    reviewDate: {
        marginTop: 4,
        color: '#555',
        fontSize: 12,
    },
    sharedNote: {
        marginTop: 2,
        color: '#555',
        fontSize: 12,
    },
    inviteNote: {
        marginTop: 2,
        color: '#555',
        fontSize: 12,
    },
});

