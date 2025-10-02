import React, { useState, useRef, useEffect, Fragment } from "react";
import {
    View,
    Text,
    Image,
    Animated,
    StyleSheet,
    TouchableWithoutFeedback,
    TouchableOpacity,
} from "react-native";
import PostActions from './PostActions/PostActions';
import { selectUser } from "../../Slices/UserSlice";
import { useSelector, useDispatch } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import PostOptionsMenu from "./PostOptionsMenu";
import StoryAvatar from "../Stories/StoryAvatar";
import { createNotification } from "../../Slices/NotificationsSlice";
import { declineFollowRequest, cancelFollowRequest, approveFollowRequest } from "../../Slices/friendsSlice";
import { handleFollowUserHelper } from "../../utils/followHelper";
import { logEngagementIfNeeded } from "../../Slices/EngagementSlice";
import PhotoFeed from "./Photos/PhotoFeed";

const pinPic = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

const MaybeTWF = ({ enabled, onPress, children }) =>
    enabled ? (
        <TouchableWithoutFeedback onPress={onPress}>{children}</TouchableWithoutFeedback>
    ) : (
        <Fragment>{children}</Fragment>
    );

export default function CheckInItem({
    item,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    handleOpenComments,
    handleDelete,
    handleEdit,
    following,
    followRequests,
    onShare,
    sharedPost = false,
}) {
    const dispatch = useDispatch();
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
    const businessName = item?.businessName;
    const postName = item?.fullName;
    const taggedUsers = item.taggedUsers;
    const userId = item?.userId;
    const profilePicUrl = item?.profilePicUrl;
    const postPhotos = item?.photos;
    const message = item?.message;
    const placeId = item?.placeId;
    const { isSuggestedFollowPost } = item;

    const navigateToBusiness = () => {
        logEngagementIfNeeded(dispatch, {
            targetType: 'place',
            targetId: placeId,
            placeId: placeId,
            engagementType: 'click',
        })

        navigation.navigate("BusinessProfile", { business: item });
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
            userId,
            mainUser: user,
            dispatch,
            setIsFollowing,
            setIsRequestSent,
        });
    };

    const handleAcceptRequest = async () => {
        await dispatch(approveFollowRequest(userId));

        // ✅ Create a notification for the original sender
        await dispatch(createNotification({
            userId,
            type: 'followAccepted',
            message: `${fullName} accepted your follow request!`,
            relatedId: userId,
            typeRef: 'User'
        }));
    };

    const handleDenyRequest = () => dispatch(declineFollowRequest({ requesterId: userId }));

    const handleCancelRequest = async () => {
        await dispatch(cancelFollowRequest({ recipientId: userId }));
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
                        onPress={() => navigateToOtherUserProfile(userId)}
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
        <MaybeTWF enabled={!!sharedPost} onPress={handleOpenComments}>
            <View style={[styles.reviewCard, sharedPost && styles.sharedHeader]}>
                {!sharedPost && (
                    <PostOptionsMenu
                        isSender={isSender}
                        dropdownVisible={dropdownVisible}
                        setDropdownVisible={setDropdownVisible}
                        handleEdit={handleEdit}
                        handleDelete={handleDelete}
                        postData={item}
                    />
                )}
                <View style={styles.section}>
                    <View style={styles.header}>
                        <View style={styles.userPicAndName}>
                            <StoryAvatar userId={userId} profilePicUrl={profilePicUrl} />
                            <View style={{ flexShrink: 1 }}>
                                <Text style={styles.userEmailText}>
                                    <TouchableWithoutFeedback >
                                        <Text
                                            style={styles.name}
                                            onPress={() => navigateToOtherUserProfile(userId)}
                                        >
                                            {postName}
                                        </Text>
                                    </TouchableWithoutFeedback>
                                    {taggedUsers?.length > 0 ? (
                                        <>
                                            <Text style={styles.business}> is with </Text>
                                            {taggedUsers.map((user, index) => (
                                                <Text
                                                    onPress={() => navigateToOtherUserProfile(user.userId)}
                                                    suppressHighlighting={true}
                                                    style={styles.name}
                                                >
                                                    {fullName}
                                                    {index < taggedUsers?.length - 1 ? ", " : ""}
                                                </Text>
                                            ))}
                                            <Text style={styles.business}> at </Text>
                                            <Text style={styles.business}>{businessName}</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.business}> is at </Text>
                                            <Text onPress={navigateToBusiness} suppressHighlighting={true} style={styles.business}>
                                                {businessName}
                                            </Text>
                                        </>
                                    )}
                                    {postPhotos?.length > 0 && (
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
                    <Text style={styles.message}>{message || null}</Text>
                    {item.photos?.length === 0 && (
                        <Image
                            source={{
                                uri: pinPic,
                            }}
                            style={styles.pinIcon}
                        />
                    )}
                </View>
                {postPhotos?.length > 0 && (
                    <PhotoFeed
                        media={postPhotos}
                        scrollX={scrollX}
                        currentIndexRef={{ current: currentPhotoIndex, setCurrent: setCurrentPhotoIndex }}
                        onPhotoTap={photoTapped}
                    />
                )}
                <Text style={styles.date}>
                    <Text>Posted: </Text>
                    <Text>
                        {item.date
                            ? new Date(item.date).toISOString().split("T")[0]
                            : "Now"}
                    </Text>
                </Text>
                {!sharedPost && (
                    <View style={{ padding: 15 }}>
                        <PostActions
                            item={item}
                            handleLikeWithAnimation={handleLikeWithAnimation}
                            handleOpenComments={handleOpenComments}
                            toggleTaggedUsers={toggleTaggedUsers}
                            photo={currentPhoto}
                            onShare={onShare}
                        />
                    </View>
                )}
            </View>
        </MaybeTWF>
    );
}

const styles = StyleSheet.create({
    reviewCard: {
        backgroundColor: "#fff",
        borderRadius: 5,
        marginBottom: 10,
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sharedHeader: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 8,
        backgroundColor: '#f9f9f9', // optional for "Facebook shared" look
        marginBottom: 10,
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
