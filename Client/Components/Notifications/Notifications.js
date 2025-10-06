import React, { useState, useRef } from 'react';
import {
    View,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Alert,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { selectIsBusiness, selectUser } from '../../Slices/UserSlice';
import { selectNotifications, markNotificationRead, setNotifications, createNotification, deleteNotification } from '../../Slices/NotificationsSlice';
import { selectBusinessNotifications, markBusinessNotificationRead, deleteBusinessNotification } from '../../Slices/BusNotificationsSlice';
import { approveFollowRequest, setFollowBack, declineFollowRequest, selectFollowers, selectFollowRequests, selectFollowing, followUserImmediately } from '../../Slices/friendsSlice';
import { selectUserAndFriendsReviews, fetchPostById, setUserAndFriendsReviews } from '../../Slices/ReviewsSlice';
import { acceptInvite, rejectInvite, acceptInviteRequest, rejectInviteRequest } from '../../Slices/InvitesSlice';
import { decrementLastSeenUnreadCount } from '../../utils/notificationsHasSeen';
import { useNavigation } from '@react-navigation/native';
import SwipeableRow from './SwipeableRow';
import { fetchEventById } from '../../Slices/EventsSlice';
import { fetchPromotionById } from '../../Slices/PromotionsSlice';
import NotificationTextContent from './NotificationTextContent';
import getNotificationIcon from './getNotificationIcon';

export default function Notifications() {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const isBusiness = useSelector(selectIsBusiness);
    const user = useSelector(selectUser);
    const notifications = useSelector((state) =>
        isBusiness ? selectBusinessNotifications(state) : selectNotifications(state)
    );
    const followRequests = useSelector(selectFollowRequests);
    const following = useSelector(selectFollowing);
    const followers = useSelector(selectFollowers);
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const [photoTapped, setPhotoTapped] = useState(null);
    const lastTapRef = useRef({});
    const userId = user?.id;
    const placeId = user?.businessDetails?.placeId;
    const fullName = `${user?.firstName} ${user?.lastName}`;

    // Helper: pick the right fetch thunk
    const getFetchAction = ({ postType, targetId }) => {
        if (postType === 'event') return fetchEventById({ eventId: targetId });
        if (postType === 'promo') return fetchPromotionById({ promotionId: targetId });
        return fetchPostById({ postType, postId: targetId });
    };

    // Helper: unify 404 detection across action or AxiosError
    const isNotFound = (resOrErr) => {
        if (!resOrErr) return false;

        // RTK rejected action shape
        const statusFromPayload = resOrErr?.payload?.status || resOrErr?.payload?.response?.status;
        const statusFromError = resOrErr?.error?.status || resOrErr?.error?.code || resOrErr?.error?.response?.status;

        // AxiosError shape
        const axiosStatus = resOrErr?.response?.status;

        const msg = (
            resOrErr?.error?.message ||
            resOrErr?.payload?.message ||
            resOrErr?.message ||
            ''
        );

        return (
            statusFromPayload === 404 ||
            statusFromError === 404 ||
            axiosStatus === 404 ||
            (typeof msg === 'string' && msg.includes('404'))
        );
    };

    // Helper: show specific "missing" alert
    const showMissingAlert = () => {
        Alert.alert(
            "Content Not Available",
            "This post, comment, or reply no longer exists.",
            [{ text: "OK" }]
        );
    };

    const handleNotificationPress = async (notification) => {
        if (!notification) return;

        const { type, postType, targetId, commentId, replyId, _id: notificationId } = notification;
        const target = replyId || commentId;

        // Mark as read first
        if (!isBusiness) {
            dispatch(markNotificationRead({ userId: user.id, notificationId }));
        } else {
            dispatch(markBusinessNotificationRead({ placeId, notificationId }));
        }
        await decrementLastSeenUnreadCount();

        const legacyTypes = [
            "comment",
            "review",
            "check-in",
            "reply",
            "like",
            "tag",
            "photoTag",
            "activityInvite",
        ];
        if (!legacyTypes.includes(type)) {
            console.warn("Unhandled notification type:", type);
            return;
        }

        console.log(notification)

        try {
            // Dispatch the correct fetch
            const action = await dispatch(getFetchAction({ postType, targetId }));

            // If the thunk rejected (network/backend error)
            if (action?.meta?.requestStatus === 'rejected') {
                if (isNotFound(action)) {
                    // 404 → stay on Notifications and alert
                    navigation.navigate('Notifications');
                    showMissingAlert();
                    return;
                }
                // Other errors
                Alert.alert("Error", "Unable to load the content.");
                return;
            }

            // Fulfilled: inspect payload
            const payload = action?.payload ?? null;

            if (!payload || isNotFound(action)) {
                // Missing or backend signaled 404-like condition
                navigation.navigate('Notifications');
                showMissingAlert();
                return;
            }

            // ✅ Content exists → navigate
            if (postType === "event" || postType === "promo") {
                navigation.navigate("EventDetails", { activity: payload, activityId: targetId });
            } else {
                navigation.navigate("CommentScreen", {
                    reviewId: targetId,
                    targetId: target,
                    toggleTaggedUsers,
                    lastTapRef,
                    photoTapped,
                });
            }
        } catch (err) {
            // Catch thrown AxiosError or unexpected throws
            if (isNotFound(err)) {
                navigation.navigate('Notifications');
                showMissingAlert();
            } else {
                console.error("Error fetching notification target:", err);
                Alert.alert("Error", "Unable to load the content.");
            }
        }
    };

    const handleAcceptRequest = async (senderId) => {
        try {
            // Optimistic UI update first
            const updatedNotifications = notifications.map((notification) =>
                notification.type === 'followRequest' && notification.relatedId === senderId
                    ? {
                        ...notification,
                        message: `You accepted ${notification.message.split(' ')[0]}'s follow request.`,
                        type: 'followRequestAccepted',
                    }
                    : notification
            );
            dispatch(setNotifications(updatedNotifications)); // not awaited
            dispatch(setFollowBack(true));

            // Now dispatch the backend calls
            await dispatch(approveFollowRequest(senderId));
            await dispatch(createNotification({
                userId: senderId,
                type: 'followRequestAccepted',
                message: `${user?.firstName} ${user?.lastName} accepted your follow request.`,
                relatedId: user?.id,
                typeRef: 'User',
            }));
        } catch (error) {
            console.error('Error accepting friend request:', error);
            // Optional: revert optimistic update if needed
        }
    };

    const handleDeclineRequest = async (senderId) => {
        try {
            await dispatch(declineFollowRequest(senderId));

            // Filter out the declined friend request from notifications
            const updatedNotifications = notifications.filter(
                (notification) => !(notification.type === 'followRequest' && notification.relatedId === senderId)
            );

            dispatch(setNotifications(updatedNotifications));
        } catch (error) {
            console.error('Error declining friend request:', error);
        }
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
                message: `${user?.firstName} ${user?.lastName} accepted your request to join the event.`,
                relatedId: user?.id,
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
                    message: `${user?.firstName} ${user?.lastName} declined your request to join the event.`,
                    relatedId: user?.id,
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

    const handleFollowBack = async (targetUserId, notificationId) => {
        try {
            const { payload } = await dispatch(followUserImmediately({ targetUserId, isFollowBack: true }));
            const enrichedUser = followers.find(u => u._id === targetUserId);
            const fullNameFollowBack = await enrichedUser
                ? `${enrichedUser.firstName} ${enrichedUser.lastName}`
                : 'them'; // fallback

            await dispatch(createNotification({
                userId: targetUserId,
                type: 'follow',
                message: `${fullName} started following you back.`,
                relatedId: userId,
                typeRef: 'User',
            }));

            // Soft-update the local notifications
            const updatedNotifications = notifications.map(n =>
                n._id === notificationId
                    ? {
                        ...n,
                        type: 'follow',
                        message: `You followed ${fullNameFollowBack} back.`,
                        read: true,
                    }
                    : n
            );

            dispatch(setNotifications(updatedNotifications));
        } catch (error) {
            console.error("Error following back:", error);
        }
    };

    return (
        <View style={styles.container}>
            <FlatList
                data={[...notifications || []].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))} // Sort by newest
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => {
                    return (
                        <SwipeableRow onSwipe={handleDeleteNotification} notificationId={item._id}>
                            <TouchableOpacity
                                style={[styles.notificationCard, !item.read && styles.unreadNotification]}
                                onPress={() => handleNotificationPress(item)}
                            >
                                {item?.type !== 'followRequest' && (
                                    <View style={styles.iconContainer}>
                                        {getNotificationIcon(item.type)}
                                    </View>
                                )}
                                <NotificationTextContent
                                    item={item}
                                    sender={(followRequests.received || []).find(user => user._id === item.relatedId)}
                                    shouldShowFollowBack={
                                        (item.type === 'followRequestAccepted' ||
                                            item.type === 'follow' ||
                                            item.type === 'followRequest') &&
                                        !following.some(user => user._id === item.relatedId) &&
                                        followers.some(user => user._id === item.relatedId)
                                    }
                                    onAcceptRequest={() => handleAcceptRequest(item.relatedId)}
                                    onDeclineRequest={() => handleDeclineRequest(item.relatedId)}
                                    onAcceptInvite={() => handleAcceptInvite(item.targetId)}
                                    onRejectInvite={() => handleRejectInvite(item.targetId)}
                                    onAcceptJoinRequest={() => handleAcceptJoinRequest(item.relatedId, item.targetId)}
                                    onRejectJoinRequest={() => handleRejectJoinRequest(item.relatedId, item.targetId)}
                                    onFollowBack={() => handleFollowBack(item.relatedId, item._id)}
                                />
                                {!item.read && <View style={styles.unreadDot} />}
                            </TouchableOpacity>
                        </SwipeableRow>
                    );
                }}
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
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#1877F2",
        marginLeft: 10,
    },
});
