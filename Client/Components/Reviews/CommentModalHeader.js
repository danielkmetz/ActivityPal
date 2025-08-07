import React, { useRef } from "react";
import { View, Text, Image, FlatList, Animated, StyleSheet, } from "react-native";
import dayjs from 'dayjs';
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import PhotoItem from "./Photos/PhotoItem";
import PhotoPaginationDots from "./Photos/PhotoPaginationDots";
import { useNavigation } from "@react-navigation/native";
import PostActions from './PostActions';
import PostUserInfo from "./CommentScreen/PostUserInfo";
import SharedPostContent from "./SharedPosts/SharedPostContent";

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
    const navigation = useNavigation();
    const scrollX = useRef(new Animated.Value(0)).current;
    const photos = review?.photos || review?.media;
    const hasTaggedUsers = Array.isArray(review?.taggedUsers) && review.taggedUsers.length > 0;
    const postOwnerPic = isInvite ? review?.sender?.profilePicUrl || review?.profilePicUrl : review?.profilePicUrl || review?.original?.profilePicUrl;
    const postOwnerName = isInvite && review?.sender?.firstName ? `${review?.sender?.firstName} ${review?.sender?.lastName}` : review?.fullName || `${review?.user?.firstName} ${review?.user?.lastName}`;
    const totalInvited = review?.recipients?.length || 0;
    const dateTime = review?.dateTime || review?.date;
    const isInvite = review?.type === "invite";
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
            {photos?.length > 0 && (
                <View >
                    <FlatList
                        data={photos}
                        horizontal
                        pagingEnabled
                        bounces={false}
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(item) => item._id}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                            { useNativeDriver: false }
                        )}
                        scrollEventThrottle={16}
                        onTouchStart={() => {
                            setIsPhotoListActive(true);
                        }}
                        onTouchEnd={() => {
                            setIsPhotoListActive(false);
                        }}
                        renderItem={({ item: photo }) => (
                            <PhotoItem
                                photo={photo}
                                reviewItem={review}
                                photoTapped={photoTapped}
                                toggleTaggedUsers={toggleTaggedUsers}
                                handleLikeWithAnimation={handleLikeWithAnimation}
                                lastTapRef={lastTapRef}
                                onOpenFullScreen={onOpenFullScreen}
                            />
                        )}
                    />
                    {photos?.length > 1 && (
                        <PhotoPaginationDots photos={photos} scrollX={scrollX} />
                    )}
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
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    reviewerName: {
        flexWrap: 'wrap',
        flexShrink: 1,
        fontSize: 16,
        marginLeft: 10,
    },
    fullName: {
        fontWeight: 'bold',
        color: '#222',
    },
    taggedUser: {
        fontWeight: 'bold',
        color: '#444',
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
    smallPinIcon: {
        width: 20,
        height: 20,
        marginLeft: 10,
        marginTop: 10,
    },
    pinIcon: {
        width: 50,
        height: 50,
        alignSelf: 'center',
        marginBottom: 10,
    },
    reviewDate: {
        marginLeft: 10,
        marginTop: 5,
    },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fff',
        zIndex: 1,
    },
    backButton: {
        padding: 5,
    },
    sharedHeader: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 8,
        backgroundColor: '#f9f9f9', // optional for "Facebook shared" look
        marginBottom: 10,
    },
});

