import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    Animated,
    TouchableOpacity,
    StyleSheet,
    Image,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { selectIsBusiness, selectUser } from '../../Slices/UserSlice';
import { selectNotifications, markNotificationRead, setNotifications, createNotification, deleteNotification } from '../../Slices/NotificationsSlice';
import { selectBusinessNotifications, markBusinessNotificationRead, deleteBusinessNotification } from '../../Slices/BusNotificationsSlice';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { acceptFriendRequest, declineFriendRequest, selectFriendRequestDetails } from '../../Slices/UserSlice';
import moment from 'moment';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import CommentModal from '../Reviews/CommentModal';
import { selectUserAndFriendsReviews, fetchPostById, selectSelectedReview, setSelectedReview, toggleLike, setUserAndFriendsReviews } from '../../Slices/ReviewsSlice';
import { acceptInvite, rejectInvite, acceptInviteRequest, rejectInviteRequest } from '../../Slices/InvitesSlice';
import { decrementLastSeenUnreadCount } from '../../utils/notificationsHasSeen';
import SwipeableRow from './SwipeableRow';

export default function Notifications() {
    const dispatch = useDispatch();
    const isBusiness = useSelector(selectIsBusiness);
    const user = useSelector(selectUser);
    const notifications = useSelector((state) => 
        isBusiness ? selectBusinessNotifications(state) : selectNotifications(state)
      );
    const friendRequestDetails = useSelector(selectFriendRequestDetails);
    const reviews = useSelector(selectUserAndFriendsReviews);
    const selectedReview = useSelector(selectSelectedReview);
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const [photoTapped, setPhotoTapped] = useState(null);
    const [commentModalVisible, setCommentModalVisible] = useState(false);
    const lastTapRef = useRef({});
    const [likedAnimations, setLikedAnimations] = useState({});
    const [targetId, setTargetId] = useState(null);
    const userId = user?.id;
    const placeId = user?.businessDetails?.placeId;
    const fullName = `${user.firstName} ${user.lastName}`;

    const handleNotificationPress = async (notification) => {
        if (!isBusiness) {
        dispatch(markNotificationRead({ userId: user.id, notificationId: notification._id }));
        } else {
            dispatch(markBusinessNotificationRead({ placeId, notificationId: notification._id }));
        }
        await decrementLastSeenUnreadCount();

        if (
            notification.type === "comment" ||
            notification.type === "review" ||
            notification.type === "check-in" ||
            notification.type === "reply" ||
            notification.type === "like" ||
            notification.type === "tag" ||
            notification.type === "photoTag" ||
            notification.type === "activityInvite"
        ) {
            if (notification) {
                const postType = notification.postType;
                
                dispatch(fetchPostById({ postType, postId: notification.targetId }));

                const target = notification.replyId || notification.commentId;
                setTargetId(target);
                setCommentModalVisible(true);
            } else {
                console.warn("Comment ID is missing in notification");
            }
        }
    };

    const handleAcceptRequest = async (senderId) => {
        try {
            await dispatch(acceptFriendRequest(senderId));

            await dispatch(createNotification({
                userId: senderId,  // The sender of the request gets notified
                type: 'friendRequestAccepted',
                message: `${user.firstName} ${user.lastName} accepted your friend request.`,
                relatedId: user.id, // The ID of the user who accepted the request
                typeRef: 'User'
            }));

            // Filter out the accepted friend request from notifications
            const updatedNotifications = notifications.filter(
                (notification) => !(notification.type === 'friendRequest' && notification.relatedId === senderId)
            );

            // Dispatch the updated notifications list
            dispatch(setNotifications(updatedNotifications));
        } catch (error) {
            console.error('Error accepting friend request:', error);
        }
    };

    const handleDeclineRequest = async (senderId) => {
        try {
            await dispatch(declineFriendRequest(senderId));

            // Filter out the declined friend request from notifications
            const updatedNotifications = notifications.filter(
                (notification) => !(notification.type === 'friendRequest' && notification.relatedId === senderId)
            );

            dispatch(setNotifications(updatedNotifications));
        } catch (error) {
            console.error('Error declining friend request:', error);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'like':
                return <MaterialCommunityIcons name="thumb-up-outline" size={24} color="#1877F2" />;
            case 'comment':
                return <MaterialCommunityIcons name="comment-outline" size={24} color="#1877F2" />;
            case 'friendRequest':
                return <MaterialCommunityIcons name="account-plus-outline" size={24} color="#42B72A" />;
            case 'event':
                return <MaterialCommunityIcons name="calendar-star" size={24} color="#F28B24" />;
            default:
                return <MaterialCommunityIcons name="bell-outline" size={24} color="#808080" />;
        }
    };

    const handleCloseComments = () => {
        dispatch(setSelectedReview(null));
    };

    const handleAcceptInvite = async (inviteId) => {
        try {
            await dispatch(acceptInvite({ recipientId: user.id, inviteId }));

            const updated = notifications.map(n =>
                n.targetId === inviteId && n.type === 'activityInvite'
                    ? { ...n, type: 'activityInviteAccepted', message: 'You accepted the invite!' }
                    : n
            );

            await dispatch(setNotifications(updated));
        } catch (error) {
            console.error('Error accepting activity invite:', error);
        }
    };

    const handleRejectInvite = async (inviteId) => {
        try {
            await dispatch(rejectInvite({ recipientId: user.id, inviteId }));

            const updated = notifications.map(n =>
                n.targetId === inviteId && n.type === 'activityInvite'
                    ? { ...n, type: 'activityInviteDeclined', message: 'You declined the invite.' }
                    : n
            );

            await dispatch(setNotifications(updated));
        } catch (error) {
            console.error('Error rejecting activity invite:', error);
        }
    };

    const toggleTaggedUsers = (photoKey) => {
        setPhotoTapped(photoTapped === photoKey ? null : photoKey);
    };

    const handleLike = async (postType, postId) => {
        // Determine where to find the post (reviews for businesses, check-ins for users)
        const postToUpdate = reviews.find((review) => review._id === postId);

        if (!postToUpdate) {
            console.error(`${postType} with ID ${postId} not found.`);
            return;
        }

        const placeId = postToUpdate.placeId;

        try {
            // Sync with the backend
            const { payload } = await dispatch(toggleLike({ postType, placeId, postId, userId, fullName }));

            // Check if the current user's ID exists in the likes array before sending a notification
            const userLiked = payload?.likes?.some((like) => like.userId === userId);

            // Dynamically get ownerId based on postType
            let ownerId;
            if (postType === 'invite') {
                ownerId = postToUpdate.sender?.id || postToUpdate.senderId;
            } else {
                ownerId = postToUpdate.userId;
            }

            // Create a notification for the post owner
            if (userLiked && ownerId !== userId) { // Avoid self-notifications
                await dispatch(createNotification({
                    userId: ownerId,
                    type: 'like',
                    message: `${fullName} liked your ${postType}.`,
                    relatedId: userId,
                    typeRef: postType === 'review' ? 'Review' : postType === 'check-in' ? 'CheckIn' : 'ActivityInvite',
                    targetId: postId,
                    postType,
                }));
            }
        } catch (error) {
            console.error(`Error toggling like for ${postType}:`, error);
        }
    };

    const handleLikeWithAnimation = async (postType, postId) => {
        const now = Date.now();

        if (!lastTapRef.current || typeof lastTapRef.current !== "object") {
            lastTapRef.current = {};
        }

        if (!lastTapRef.current[postId]) {
            lastTapRef.current[postId] = 0;
        }

        if (now - lastTapRef.current[postId] < 300) {
            const postBeforeUpdate = reviews.find((review) => review._id === postId);
            const wasLikedBefore = postBeforeUpdate?.likes?.some((like) => like.userId === user?.id);

            await handleLike(postType, postId);

            if (!wasLikedBefore) {
                if (!likedAnimations[postId]) {
                    setLikedAnimations((prev) => ({
                        ...prev,
                        [postId]: new Animated.Value(0),
                    }));
                }

                const animation = likedAnimations[postId] || new Animated.Value(0);

                Animated.timing(animation, {
                    toValue: 1,
                    duration: 50,
                    useNativeDriver: true,
                }).start(() => {
                    setTimeout(() => {
                        Animated.timing(animation, {
                            toValue: 0,
                            duration: 500,
                            useNativeDriver: true,
                        }).start();
                    }, 500);
                });

                setLikedAnimations((prev) => ({
                    ...prev,
                    [postId]: animation,
                }));
            }
        }

        lastTapRef.current[postId] = now;
    };

    const handleAcceptJoinRequest = async (relatedId, targetId) => {
        try {
            const { payload: result } = await dispatch(
                acceptInviteRequest({ userId: relatedId, inviteId: targetId })
            );
    
            if (!result.success || !result.invite) {
                console.warn('⚠️ No valid invite returned from backend');
                throw new Error('Backend did not return a valid invite');
            }
    
            const updatedInvite = result.invite;
    
            // ✅ Send confirmation notification
            const notifPayload = {
                userId: relatedId,
                type: 'activityInviteAccepted',
                message: `${user.firstName} ${user.lastName} accepted your request to join the event.`,
                relatedId: user.id,
                typeRef: 'ActivityInvite',
                targetId,
                targetRef: 'ActivityInvite',
                postType: 'invite',
            };
    
            await dispatch(createNotification(notifPayload));
    
            // ✅ Replace the invite in the list
            const updatedList = userAndFriendsReviews.map(invite =>
                invite._id === targetId ? updatedInvite : invite
            );

            const updatedInvites = updatedList.filter(item => item.type === 'invite');
            console.log('🆕 Updated invites only:', updatedInvites);
    
            dispatch(setUserAndFriendsReviews(updatedList));
    
            // ✅ Remove the requestInvite notification
            const filtered = notifications.filter(n =>
                !(n.type === 'requestInvite' && n.relatedId === relatedId && n.targetId === targetId)
            );
    
            dispatch(setNotifications(filtered));
    
        } catch (error) {
            console.error('❌ Error accepting join request:', error);
        }
    };    

    const handleRejectJoinRequest = async (relatedId, targetId) => {
        try {
            const { payload: updatedInvite } = await dispatch(
                rejectInviteRequest({ userId: relatedId, inviteId: targetId })
            );

            // ✅ Notify the user who was rejected
            await dispatch(
                createNotification({
                    userId: relatedId,
                    type: 'activityInviteDeclined',
                    message: `${user.firstName} ${user.lastName} declined your request to join the event.`,
                    relatedId: user.id,
                    typeRef: 'User',
                    targetId,
                    postType: 'invite',
                })
            );

            const filtered = notifications.filter(n =>
                !(n.type === 'requestInvite' && n.relatedId === relatedId && n.targetId === targetId)
            );
            await dispatch(setNotifications(filtered));
        } catch (error) {
            console.error('❌ Error rejecting join request:', error);
        }
    };

    const handleDeleteNotification = (notificationId) => {
        if (!isBusiness) {
        dispatch(deleteNotification({ userId: user.id, notificationId }));
        } else {
            dispatch(deleteBusinessNotification({ placeId, notificationId }));
        }
    };
    
    return (
        <View style={styles.container}>
            <FlatList
                data={[...notifications || []].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))} // Sort by newest
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => {
                    const sender = (friendRequestDetails || []).find(user => user._id === item.relatedId);
                    return (
                        <SwipeableRow onSwipe={handleDeleteNotification} notificationId={item._id}>
                        <TouchableOpacity
                            style={[styles.notificationCard, !item.read && styles.unreadNotification]}
                            onPress={() => handleNotificationPress(item)}
                        >
                            {item?.type !== 'friendRequest' && (
                                <View style={styles.iconContainer}>
                                    {getIcon(item.type)}
                                </View>
                            )}
                            <View style={[styles.textContainer, item.type === 'friendRequest' && { marginLeft: 10 }]}>
                                {item?.type === 'friendRequest' && sender ? (
                                    <View style={styles.friendRequestContainer}>
                                        <Image
                                            source={sender.presignedProfileUrl ? { uri: sender.presignedProfileUrl } : profilePicPlaceholder}
                                            style={styles.profilePic}
                                        />
                                        <Text style={styles.message}>{item.message}</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.message}>{item.message}</Text>
                                )}
                                {item?.commentText ? (
                                    <Text style={styles.commentText}>{item?.commentText}</Text>
                                ) : (
                                    null
                                )}
                                <View style={styles.momentContainer}>
                                    {item.type === 'friendRequest' && (
                                        <View style={styles.iconContainer}>
                                            {getIcon(item.type)}
                                        </View>
                                    )}
                                    <Text style={styles.timestamp}>{moment(item.createdAt).fromNow()}</Text>
                                </View>
                                {item.type === 'friendRequest' && sender && (
                                    <View style={styles.buttonGroup}>
                                        <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptRequest(item.relatedId)}>
                                            <Text style={styles.buttonText}>Accept</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.declineButton} onPress={() => handleDeclineRequest(item.relatedId)}>
                                            <Text style={styles.buttonText}>Decline</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {item.type === 'activityInvite' && (
                                    <View style={styles.buttonGroup}>
                                        <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptInvite(item.targetId)}>
                                            <Text style={styles.buttonText}>Accept</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.declineButton} onPress={() => handleRejectInvite(item.targetId)}>
                                            <Text style={styles.buttonText}>Decline</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {item.type === 'requestInvite' && (
                                    <View style={styles.buttonGroup}>
                                        <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptJoinRequest(item.relatedId, item.targetId)}>
                                            <Text style={styles.buttonText}>Accept</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.declineButton} onPress={() => handleRejectJoinRequest(item.relatedId, item.targetId)}>
                                            <Text style={styles.buttonText}>Reject</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                            {!item.read && <View style={styles.unreadDot} />}
                        </TouchableOpacity>
                        </SwipeableRow>
                    );
                }}
            />
            {/* Comment Modal */}
            <CommentModal
                visible={commentModalVisible}
                review={selectedReview}
                onClose={handleCloseComments}
                setSelectedReview={setSelectedReview}
                reviews={reviews} // You may need to adjust this
                targetId={targetId}
                likedAnimations={likedAnimations}
                handleLikeWithAnimation={handleLikeWithAnimation}
                toggleTaggedUsers={toggleTaggedUsers}
                lastTapRef={lastTapRef}
                photoTapped={photoTapped}
                setCommentModalVisible={setCommentModalVisible}
            />

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F0F2F5",
        paddingVertical: 10,
        marginTop: 120,
        paddingBottom: 100,
    },
    notificationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 10,
        marginVertical: 5,
        borderRadius: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 3,
    },
    unreadNotification: {
        backgroundColor: "#E7F3FF",
    },
    iconContainer: {
        marginRight: 10,
    },
    textContainer: {
        flex: 1,
    },
    momentContainer: {
        flexDirection: 'row'
    },
    friendRequestContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    profilePic: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
    },
    message: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    timestamp: {
        fontSize: 12,
        color: '#777',
        marginTop: 2,
    },
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#1877F2",
        marginLeft: 10,
    },
    buttonGroup: {
        flexDirection: 'row',
        marginTop: 8,
    },
    acceptButton: {
        backgroundColor: "#33cccc",
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 5,
        marginRight: 10,
    },
    declineButton: {
        backgroundColor: "#6c757d",
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 5,
    },
    buttonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: 'bold',
    },
    commentText: {
        marginVertical: 10,
    },
});
