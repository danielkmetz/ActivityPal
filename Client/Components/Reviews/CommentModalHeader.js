import React, { useRef } from "react";
import { View, Text, Image, FlatList, Animated, StyleSheet, TouchableOpacity } from "react-native";
import { Avatar } from "@rneui/themed";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import profilePicPlaceholder from "../../assets/pics/profile-pic-placeholder.jpg";
import PhotoItem from "./PhotoItem";
import PhotoPaginationDots from "./PhotoPaginationDots";
import { useNavigation } from "@react-navigation/native";
import PostActions from './PostActions';

const CommentModalHeader = ({
    review,
    isInvite,
    hasTaggedUsers,
    postOwnerPic,
    postOwnerName,
    totalInvited,
    timeLeft,
    dateTime,
    formatEventDate,
    likedAnimations,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    lastTapRef,
    getTimeSincePosted,
    onClose,
    setIsPhotoListActive,
}) => {
    const navigation = useNavigation();
    const scrollX = useRef(new Animated.Value(0)).current;

    const onOpenFullScreen = (photo, index) => {
        navigation.navigate("FullScreenPhoto", {
            reviewId: review?._id,
            initialIndex: review.photos.findIndex(p => p._id === photo._id),
        })
    }

    return (
        <View style={styles.header}>
            <View style={styles.headerText}>
                <View style={styles.userInfo}>
                    <View style={styles.headerBar}>
                        <TouchableOpacity onPress={onClose} style={styles.backButton}>
                            <MaterialCommunityIcons name="chevron-left" size={26} color="#000" />
                        </TouchableOpacity>
                    </View>
                    <Avatar
                        size={48}
                        rounded
                        source={postOwnerPic ? { uri: postOwnerPic } : profilePicPlaceholder}
                        icon={!postOwnerPic ? { name: 'person', type: 'material', color: '#fff' } : null}
                        containerStyle={{ backgroundColor: '#ccc' }}
                    />
                    <View style={{ flexDirection: 'column', flexShrink: 1 }}>
                        <Text style={styles.reviewerName}>
                            {isInvite ? (
                                <Text style={styles.fullName}>
                                    {postOwnerName} invited {totalInvited} friend
                                    {totalInvited.length === 1 ? '' : 's'} to a Vybe
                                </Text>
                            ) : (
                                <Text style={styles.fullName}>{postOwnerName}</Text>
                            )}
                            {!isInvite && hasTaggedUsers ? " is with " : !isInvite ? " is " : null}
                            {Array.isArray(review?.taggedUsers) && review?.taggedUsers?.map((user, index) => (
                                <Text key={user?.userId || `tagged-${index}`} style={styles.taggedUser}>
                                    {user?.fullName}
                                    {index !== review?.taggedUsers.length - 1 ? ", " : ""}
                                </Text>
                            ))}
                            {review?.type === "check-in" && (
                                <Text>
                                    {" "}at{hasTaggedUsers ? <Text>{'\n'}</Text> : <Text>{" "}</Text>}
                                    <Text style={styles.businessName}>{review?.businessName}</Text>
                                    {review?.photos?.length > 0 && (
                                        <Image
                                            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }}
                                            style={styles.smallPinIcon}
                                        />
                                    )}
                                </Text>
                            )}
                        </Text>
                        <Text style={styles.reviewDate}>{getTimeSincePosted(review?.date)} ago</Text>
                    </View>
                </View>

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
            {review?.photos?.length > 0 && (
                <View >
                    <FlatList
                        data={review?.photos}
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
                                likedAnimations={likedAnimations}
                                photoTapped={photoTapped}
                                toggleTaggedUsers={toggleTaggedUsers}
                                handleLikeWithAnimation={handleLikeWithAnimation}
                                lastTapRef={lastTapRef}
                                onOpenFullScreen={onOpenFullScreen}
                            />
                        )}
                    />
                    {review.photos?.length > 1 && (
                        <PhotoPaginationDots photos={review.photos} scrollX={scrollX} />
                    )}
                </View>
            )}
            {review?.type === "check-in" && review?.photos?.length === 0 && (
                <Image
                    source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }}
                    style={styles.pinIcon}
                />
            )}
            <View style={{ paddingLeft: 15 }}>
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
});

