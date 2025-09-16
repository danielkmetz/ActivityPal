import React, { useState, useRef, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Dimensions,
    TouchableWithoutFeedback,
    TouchableOpacity,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import PostActions from "./PostActions";
import PostOptionsMenu from "./PostOptionsMenu";
import ExpandableText from "./ExpandableText";
import { selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from "react-redux";
import StoryAvatar from "../Stories/StoryAvatar";
import { useNavigation } from "@react-navigation/native";
import { handleFollowUserHelper } from "../../utils/followHelper";
import { createNotification } from "../../Slices/NotificationsSlice";
import RatingsBreakdownModal from "./metricRatings/RatingsBreakdownModal";
import { declineFollowRequest, cancelFollowRequest, approveFollowRequest } from "../../Slices/friendsSlice";
import { logEngagementIfNeeded } from "../../Slices/EngagementSlice";
import PhotoFeed from "./Photos/PhotoFeed";

export default function ReviewItem({
    item,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    handleOpenComments,
    lastTapRef,
    handleEdit,
    handleDelete,
    following,
    followRequests,
    onShare,
    sharedPost,
}) {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const user = useSelector(selectUser);
    const isSender = item.userId === user?.id;
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const currentIndexRef = useRef(0);
    const [isFollowing, setIsFollowing] = useState(false);
    const [ratingsOpen, setRatingsOpen] = useState(false);
    const [isRequestSent, setIsRequestSent] = useState(false);
    const [isRequestReceived, setIsRequestReceived] = useState(false);

    const scrollX = useRef(new Animated.Value(0)).current;
    const currentPhoto = item.photos?.[currentPhotoIndex];
    const { isSuggestedFollowPost } = item;
    const isPrivate = item?.profileVisibility === 'private';
    const fullName = `${user.firstName} ${user.lastName}`;
    const postPhotos = item?.photos;
    const placeId = item?.placeId;
    const postOwnerId = item?.userId;

    const taggedUsersByPhotoKey = Object.fromEntries(
        (postPhotos || []).map((photo) => [
            photo.photoKey,
            photo.taggedUsers || [],
        ])
    );

    const navigateToBusiness = () => {
        logEngagementIfNeeded(dispatch, {
            targetType: 'place',
            targetId: placeId,
            placeId,
            engagementType: 'click',
        })
        navigation.navigate("BusinessProfile", { business: item });
    }

    const handleOpenFullScreen = (photo, index) => {
        navigation.navigate('FullScreenPhoto', {
            reviewId: item._id,
            initialIndex: index,
            lastTapRef,
            taggedUsersByPhotoKey: taggedUsersByPhotoKey || {}, // or however you pass it
            isSuggestedPost: isSuggestedFollowPost,
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
            userId: postOwnerId,
            mainUser: user,
            dispatch,
            setIsFollowing,
            setIsRequestSent,
        });
    };

    const handleAcceptRequest = async () => {
        await dispatch(approveFollowRequest(postOwnerId));

        // ✅ Create a notification for the original sender
        await dispatch(createNotification({
            userId: postOwnerId,
            type: 'followAccepted',
            message: `${fullName} accepted your follow request!`,
            relatedId: postOwnerId,
            typeRef: 'User'
        }));
    };

    const handleDenyRequest = () => dispatch(declineFollowRequest({ requesterId: postOwnerId }));

    const handleCancelRequest = async () => {
        await dispatch(cancelFollowRequest({ recipientId: postOwnerId }));
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

    useEffect(() => {
        const interval = setInterval(() => {
            if (currentPhotoIndex !== currentIndexRef.current) {
                setCurrentPhotoIndex(currentIndexRef.current);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [currentPhotoIndex]);

    const renderFollowButton = () => {
        if (isSuggestedFollowPost) {
            if (isFollowing) {
                return (
                    <TouchableOpacity
                        style={styles.followButton}
                        onPress={() => navigateToOtherUserProfile(postOwnerId)}
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
        <View>
            <View style={styles.reviewCard}>
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
                    <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={[styles.userPicAndName, { flex: 1, flexShrink: 1 }]}>
                                <StoryAvatar userId={postOwnerId} profilePicUrl={item.profilePicUrl} />
                                <View style={{ flexShrink: 1 }}>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                        <TouchableWithoutFeedback onPress={() => navigateToOtherUserProfile(item.userId)}>
                                            <Text style={styles.userEmailText}>{item.fullName}</Text>
                                        </TouchableWithoutFeedback>
                                        {item.taggedUsers?.length > 0 && (
                                            <>
                                                <Text style={styles.business}> is with </Text>
                                                {item.taggedUsers.map((user, index) => (
                                                    <TouchableWithoutFeedback
                                                        key={user.userId || index}
                                                        onPress={() => navigateToOtherUserProfile(user.userId)}
                                                    >
                                                        <Text style={styles.userEmailText}>
                                                            {user.fullName}
                                                            {index < item?.taggedUsers?.length - 1 ? ", " : ""}
                                                        </Text>
                                                    </TouchableWithoutFeedback>
                                                ))}
                                            </>
                                        )}
                                    </View>
                                    {isSuggestedFollowPost && (
                                        <Text style={styles.subText}>Suggested user for you</Text>
                                    )}
                                </View>
                            </View>
                            {renderFollowButton()}
                        </View>
                    </View>
                    <TouchableOpacity onPress={navigateToBusiness}>
                        <Text style={styles.business}>{item.businessName}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setRatingsOpen(true)} activeOpacity={0.7}>
                        <View style={styles.ratingButton}>
                            <View style={styles.ratingStars}>
                                {Array.from({ length: item.rating }).map((_, index) => (
                                    <MaterialCommunityIcons
                                        key={index}
                                        name="star"
                                        size={18}
                                        color="gold"
                                    />
                                ))}
                            </View>
                        </View>
                    </TouchableOpacity>
                    <ExpandableText
                        text={item.reviewText}
                        maxLines={4}
                        textStyle={styles.review}
                    />
                </View>
                {/* ✅ Photos */}
                {postPhotos?.length > 0 && (
                    <PhotoFeed
                        media={postPhotos}
                        scrollX={scrollX}
                        currentIndexRef={currentIndexRef}
                        reviewItem={item}
                        photoTapped={photoTapped}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        lastTapRef={lastTapRef}
                        onOpenFullScreen={handleOpenFullScreen}
                        setCurrentPhotoIndex={setCurrentPhotoIndex}
                    />
                )}
                <Text style={styles.date}>
                    Posted: {item.date ? new Date(item.date).toISOString().split("T")[0] : "Now"}
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
            <RatingsBreakdownModal
                visible={ratingsOpen}
                onClose={() => setRatingsOpen(false)}
                ratings={{
                    rating: item.rating,
                    priceRating: item.priceRating,
                    serviceRating: item.serviceRating,
                    atmosphereRating: item.atmosphereRating,
                    wouldRecommend: item.wouldRecommend,
                }}
            />
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
    sharedPostWrapper: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        backgroundColor: '#f9f9f9',
        marginBottom: 10,
        overflow: 'hidden', // ensures border doesn't get clipped
    },
    section: {
        padding: 10,
        flexShrink: 1,
    },
    sharedHeader: {
        borderColor: '#ccc',
        borderRadius: 8,
        backgroundColor: '#f9f9f9', // optional for "Facebook shared" look
        marginBottom: 10,
    },
    profilePic: {
        marginRight: 10,
    },
    userPicAndName: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 15,
        padding: 6,
    },
    userEmailText: {
        fontSize: 18,
        fontWeight: "bold",
    },
    business: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#555",
    },
    rating: {
        fontSize: 14,
        flexDirection: "row",
    },
    review: {
        fontSize: 16,
        marginTop: 5,
    },
    message: {
        marginBottom: 15,
        fontSize: 16,
    },
    smallPinIcon: {
        width: 20,
        height: 20,
        marginLeft: 5,
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
    seeMore: {
        color: '#007AFF',
        fontSize: 14,
        marginTop: 5,
    },
    storyBorder: {
        borderWidth: 3,
        borderColor: '#1e90ff',
        borderRadius: 999,
    },
    subText: {
        color: "#555",
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
    ratingButtonContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        marginBottom: 4,
    },
    ratingButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: '#bfbfbf',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 2,
        elevation: 2, // Android
        shadowColor: '#000', // iOS
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        marginTop: 6,
        marginBottom: 4,
    },
    ratingStars: {
        flexDirection: 'row',
    },
});
