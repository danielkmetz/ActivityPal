import React, { useState, useRef, useEffect } from "react";
import {
    View,
    Text,
    Image,
    FlatList,
    Animated,
    StyleSheet,
    Dimensions,
    TouchableWithoutFeedback,
    TouchableOpacity,
} from "react-native";
import PhotoItem from "./PhotoItem";
import PhotoPaginationDots from "./PhotoPaginationDots";
import PostActions from './PostActions';
import { selectUser } from "../../Slices/UserSlice";
import { useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import PostOptionsMenu from "./PostOptionsMenu";
import StoryAvatar from "../Stories/StoryAvatar";
import { createNotification } from "../../Slices/NotificationsSlice";
import { declineFollowRequest, cancelFollowRequest, approveFollowRequest } from "../../Slices/friendsSlice";
import { handleFollowUserHelper } from "../../utils/followHelper";

const pinPic = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

const screenWidth = Dimensions.get("window").width;

export default function CheckInItem({
    item,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    handleOpenComments,
    lastTapRef,
    handleDelete,
    handleEdit,
    following,
    followRequests,
}) {
    const navigation = useNavigation();
    const user = useSelector(selectUser);
    const isSender = item.userId === user?.id;
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isRequestSent, setIsRequestSent] = useState(false);
    const [isRequestReceived, setIsRequestReceived] = useState(false);
    const scrollX = useRef(new Animated.Value(0)).current;
    const currentPhoto = item.photos?.[currentPhotoIndex];
    const postOwnerId = item?.userId;
    const fullName = `${user.firstName} ${user.lastName}`;
    const { isSuggestedFollowPost } = item;

    const handleOpenFullScreen = (photo, index) => {
        navigation.navigate('FullScreenPhoto', {
            reviewId: item._id,
            initialIndex: index,
            lastTapRef,
            taggedUsersByPhotoKey: item.taggedUsersByPhotoKey || {}, // or however you pass it
            isSuggestedPost: isSuggestedFollowPost
        });
    };

    const navigateToOtherUserProfile = (userId) => {
        if (userId !== user?.id) {
            navigation.navigate('OtherUserProfile', { userId }); // Pass user data to the new screen
        } else {
            navigation.navigate('Profile');
        }
    };

    const handleFollowUser = () => {
        handleFollowUserHelper({
            isPrivate,
            userId: item.userId,
            mainUser: user,
            dispatch,
            setIsFollowing,
            setIsRequestSent,
        });
    };

    const handleAcceptRequest = async () => {
        await dispatch(approveFollowRequest(item.userId));

        // ✅ Create a notification for the original sender
        await dispatch(createNotification({
            userId: item.userId,
            type: 'followAccepted',
            message: `${fullName} accepted your follow request!`,
            relatedId: item.userId,
            typeRef: 'User'
        }));
    };

    const handleDenyRequest = () => dispatch(declineFollowRequest({ requesterId: item.userId }));

    const handleCancelRequest = async () => {
        await dispatch(cancelFollowRequest({ recipientId: item.userId }));
        // ✅ Explicitly update the state to ensure UI reflects the change
        setIsRequestSent(false);
    };

    useEffect(() => {
        if (!user || !followRequests || !following) return;

        const followingIds = following.map(u => u._id);
        const sentRequestIds = (followRequests?.sent || []).map(u => u._id || u);
        const receivedRequestIds = (followRequests?.received || []).map(u => u._id || u);

        setIsRequestSent(sentRequestIds.includes(postOwnerId));
        setIsRequestReceived(receivedRequestIds.includes(postOwnerId));
        setIsFollowing(followingIds.includes(postOwnerId));
    }, [user, following, followRequests]);

    const renderFollowButton = () => {
        if (isSuggestedFollowPost) {
            if (isFollowing) {
                return (
                    <TouchableOpacity
                        style={styles.followButton}
                        onPress={() => navigateToOtherUserProfile(item.userId)}
                    >
                        <Text style={styles.friendsText}>Following</Text>
                    </TouchableOpacity>
                );
            }
            if (isRequestReceived) {
                return (
                    <View style={styles.requestButtonsContainer}>
                        <TouchableOpacity style={styles.acceptRequestButton} onPress={handleAcceptRequest}>
                            <Text style={styles.acceptRequestText}>Accept Request</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.followButton} onPress={handleDenyRequest}>
                            <Text style={styles.followButtonText}>Deny Request</Text>
                        </TouchableOpacity>
                    </View>
                );
            }
            if (isRequestSent) {
                return (
                    <TouchableOpacity style={styles.followButton} onPress={handleCancelRequest}>
                        <Text style={styles.followButtonText}>Cancel Request</Text>
                    </TouchableOpacity>
                );
            }
            return (
                <TouchableOpacity style={styles.followButton} onPress={handleFollowUser}>
                    <Text style={styles.followButtonText}>Follow</Text>
                </TouchableOpacity>
            );
        }
    };

    return (
        <View style={styles.reviewCard}>
            <PostOptionsMenu
                isSender={isSender}
                dropdownVisible={dropdownVisible}
                setDropdownVisible={setDropdownVisible}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
                postData={item}
            />
            <View style={styles.section}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={styles.userPicAndName}>
                        <StoryAvatar userId={item?.userId} profilePicUrl={item.profilePicUrl} />
                        <View style={{ flexShrink: 1 }}>
                            <Text style={styles.userEmailText}>
                                <TouchableWithoutFeedback onPress={() => navigateToOtherUserProfile(item.userId)}>
                                    <Text style={styles.name}>{item.fullName}</Text>
                                </TouchableWithoutFeedback>
                                {item.taggedUsers?.length > 0 ? (
                                    <>
                                        <Text style={styles.business}> is with </Text>
                                        {item.taggedUsers.map((user, index) => (
                                            <TouchableWithoutFeedback
                                                key={user._id || index}
                                                onPress={() => navigateToOtherUserProfile(user.userId)}
                                            >
                                                <Text style={styles.name}>
                                                    {user.fullName}
                                                    {index < item.taggedUsers.length - 1 ? ", " : ""}
                                                </Text>
                                            </TouchableWithoutFeedback>
                                        ))}
                                        <Text style={styles.business}> at </Text>
                                        <Text style={styles.business}>{item.businessName}</Text>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.business}> is at </Text>
                                        <Text style={styles.business}>{item.businessName}</Text>
                                    </>
                                )}
                                {item.photos.length > 0 && (
                                    <Image
                                        source={{ uri: pinPic }}
                                        style={styles.smallPinIcon}
                                    />
                                )}
                            </Text>
                            {isSuggestedFollowPost && (
                                <Text style={styles.subText}>Suggested user for you</Text>
                            )}
                        </View>
                    </View>
                    {renderFollowButton()}
                </View>
                <Text style={styles.message}>{item.message || null}</Text>
                {item.photos?.length === 0 && (
                    <Image
                        source={{
                            uri: pinPic,
                        }}
                        style={styles.pinIcon}
                    />
                )}
            </View>
            {item.photos?.length > 0 && (
                <View>
                    <FlatList
                        data={item.photos}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(photo, index) => index.toString()}
                        scrollEnabled={item.photos.length > 1}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                            {
                                useNativeDriver: false,
                                listener: (e) => {
                                    const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                                    setCurrentPhotoIndex(index);
                                },
                            }
                        )}
                        scrollEventThrottle={16}
                        renderItem={({ item: photo, index }) => (
                            <PhotoItem
                                photo={photo}
                                reviewItem={item}
                                index={index}
                                photoTapped={photoTapped}
                                toggleTaggedUsers={toggleTaggedUsers}
                                handleLikeWithAnimation={handleLikeWithAnimation}
                                lastTapRef={lastTapRef}
                                onOpenFullScreen={handleOpenFullScreen}
                                isSuggestedPost={isSuggestedFollowPost}
                            />
                        )}
                    />
                    <PhotoPaginationDots photos={item.photos} scrollX={scrollX} />
                </View>
            )}
            <Text style={styles.date}>
                Posted:{" "}
                {item.date
                    ? new Date(item.date).toISOString().split("T")[0]
                    : "Now"}
            </Text>
            <View style={{ padding: 15 }}>
                <PostActions
                    item={item}
                    handleLikeWithAnimation={handleLikeWithAnimation}
                    handleOpenComments={handleOpenComments}
                    toggleTaggedUsers={toggleTaggedUsers}
                    photo={currentPhoto}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    reviewCard: {
        backgroundColor: "#fff",
        borderRadius: 5,
        marginBottom: 10,
        elevation: 2,
    },
    section: {
        padding: 10,
    },
    userPicAndName: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 15,
        padding: 6,
        paddingRight: 30,
        flexShrink: 1,
    },
    profilePic: {
        marginRight: 10,
    },
    userEmailText: {
        fontSize: 18,
    },
    name: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    business: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#555",
    },
    smallPinIcon: {
        width: 16,
        height: 16,
        marginLeft: 5,
        marginBottom: -5,
        marginTop: 5,
    },
    pinIcon: {
        width: 50,
        height: 50,
        marginTop: 15,
        alignSelf: "center",
    },
    message: {
        marginBottom: 15,
        fontSize: 16,
    },
    date: {
        fontSize: 12,
        color: "#555",
        marginLeft: 10,
        marginTop: 10,
    },
    actionsContainer: {
        flexDirection: "row",
        padding: 15,
    },
    likeButton: {
        flexDirection: "row",
        alignItems: "center",
        marginRight: 10,
    },
    likeCount: {
        fontSize: 14,
        color: "#555",
        marginLeft: 5,
    },
    commentButton: {
        flexDirection: "row",
    },
    commentCount: {
        marginLeft: 5,
    },
    subText: {
        color: "#555",
        marginTop: 4,
    },
    followButton: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#b3b3b3',
    },
    followButtonText: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#fff',
    },
});
