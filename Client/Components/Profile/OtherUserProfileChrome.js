import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import OtherUserHeader from "./OtherUser/OtherUserHeader";
import FollowControls from "./FollowControls";
import ProfileTabs from "./ProfileTabs";
import { selectUser, selectOtherUserSettings, selectOtherUserName } from "../../Slices/UserSlice";
import {
    selectFollowRequests,
    selectFollowing,
    approveFollowRequest,
    cancelFollowRequest,
    declineFollowRequest,
    unfollowUser,
    selectOtherUserFollowers,
    selectOtherUserFollowing,
} from "../../Slices/friendsSlice";
import { createNotification } from "../../Slices/NotificationsSlice";
import { selectConversations, chooseUserToMessage } from "../../Slices/DirectMessagingSlice";
import { selectOtherUserBanner, selectOtherUserProfilePic } from "../../Slices/PhotosSlice";
import { handleFollowUserHelper } from "../../utils/followHelper";
import { toId } from "../../utils/Formatting/toId";

function OtherUserProfileChrome({
    userId,
    activeSection,
    setActiveSection,
    onOpenFollowers,
    onOpenFollowing,
}) {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const me = useSelector(selectUser);
    const fullName = useSelector(selectOtherUserName) || "";
    const bannerUrl = useSelector((s) => selectOtherUserBanner(s)?.url || "");
    const profilePicUrl = useSelector((s) => selectOtherUserProfilePic(s)?.url || "");
    const privacy = useSelector(selectOtherUserSettings) || {};
    const isPrivate = privacy?.profileVisibility === "private";
    const followersCount = useSelector((s) => (selectOtherUserFollowers(s) || []).length);
    const followingCount = useSelector((s) => (selectOtherUserFollowing(s) || []).length);
    
    const isFollowingStore = useSelector((s) =>
        (selectFollowing(s) || []).some((u) => toId(u?._id || u?.id) === toId(userId))
    );
    const isRequestSentStore = useSelector((s) =>
        (selectFollowRequests(s)?.sent || []).some((u) => toId(u?._id || u) === toId(userId))
    );
    const isRequestReceivedStore = useSelector((s) =>
        (selectFollowRequests(s)?.received || []).some((u) => toId(u?._id || u) === toId(userId))
    );

    // local override so UI updates instantly even if store lags
    const [local, setLocal] = useState({
        isFollowing: null,
        isRequestSent: null,
        isRequestReceived: null,
    });

    const isFollowing = local.isFollowing ?? isFollowingStore;
    const isRequestSent = local.isRequestSent ?? isRequestSentStore;
    const isRequestReceived = local.isRequestReceived ?? isRequestReceivedStore;

    // When store catches up, drop overrides
    useEffect(() => {
        setLocal((prev) => ({
            isFollowing: prev.isFollowing === isFollowingStore ? null : prev.isFollowing,
            isRequestSent: prev.isRequestSent === isRequestSentStore ? null : prev.isRequestSent,
            isRequestReceived: prev.isRequestReceived === isRequestReceivedStore ? null : prev.isRequestReceived,
        }));
    }, [isFollowingStore, isRequestSentStore, isRequestReceivedStore]);

    // Messaging
    const conversations = useSelector(selectConversations) || [];
    const otherUserFollowingArr = useSelector(selectOtherUserFollowing) || []; // used in recipient object
    const onBack = useCallback(() => navigation.goBack(), [navigation]);

    const handleCancelRequest = useCallback(async () => {
        await dispatch(cancelFollowRequest({ recipientId: userId }));
        setLocal((p) => ({ ...p, isRequestSent: false }));
    }, [dispatch, userId]);

    const handleDenyRequest = useCallback(() => {
        dispatch(declineFollowRequest({ requesterId: userId }));
        setLocal((p) => ({ ...p, isRequestReceived: false }));
    }, [dispatch, userId]);

    const handleUnfollow = useCallback(() => {
        dispatch(unfollowUser(userId));
        setLocal((p) => ({ ...p, isFollowing: false }));
    }, [dispatch, userId]);

    const handleFollow = useCallback(() => {
        // Uses your existing helper so behavior stays consistent
        handleFollowUserHelper({
            isPrivate,
            userId,
            mainUser: me,
            dispatch,
            setIsFollowing: (v) => setLocal((p) => ({ ...p, isFollowing: v })),
            setIsRequestSent: (v) => setLocal((p) => ({ ...p, isRequestSent: v })),
        });
    }, [isPrivate, userId, me, dispatch]);

    const handleAcceptRequest = useCallback(async () => {
        await dispatch(approveFollowRequest(userId));
        setLocal((p) => ({ ...p, isFollowing: true, isRequestReceived: false }));

        // Your old code used the OTHER user's name in the message (wrong).
        const myName = `${me?.firstName || ""} ${me?.lastName || ""}`.trim() || "Someone";

        await dispatch(
            createNotification({
                userId, // notify the requester
                type: "followAccepted",
                message: `${myName} accepted your follow request!`,
                relatedId: toId(me?.id || me?._id), // actor
                typeRef: "User",
            })
        );
    }, [dispatch, userId, me]);

    const handleSendMessage = useCallback(() => {
        const currentUserId = toId(me?.id || me?._id);
        const otherId = toId(userId);
        if (!currentUserId || !otherId) return;

        const participantIds = [currentUserId, otherId].sort();

        const existingConversation = (conversations || []).find((conv) => {
            const ids = (conv.participants || [])
                .map((p) => (typeof p === "object" ? p._id : p))
                .map(toId)
                .filter(Boolean)
                .sort();

            return ids.length === participantIds.length && ids.every((id, i) => id === participantIds[i]);
        });

        const recipient = {
            _id: userId,
            firstName: fullName?.split(" ")[0] || "",
            lastName: fullName?.split(" ")[1] || "",
            profilePic: profilePicUrl ? { url: profilePicUrl } : {},
            profilePicUrl: profilePicUrl || "",
            privacySettings: privacy || {},
            following: otherUserFollowingArr || [],
        };

        dispatch(chooseUserToMessage([recipient]));

        navigation.navigate("MessageThread", {
            conversationId: existingConversation?._id || null,
            participants: [recipient],
        });
    }, [dispatch, navigation, me, userId, conversations, fullName, profilePicUrl, privacy, otherUserFollowingArr]);

    return (
        <>
            <OtherUserHeader
                onBack={onBack}
                bannerUrl={bannerUrl}
                profilePicUrl={profilePicUrl}
                fullName={fullName}
                followersCount={followersCount}
                followingCount={followingCount}
                openFollowers={onOpenFollowers}
                openFollowing={onOpenFollowing}
            />
            <FollowControls
                isFollowing={isFollowing}
                isRequestSent={isRequestSent}
                isRequestReceived={isRequestReceived}
                onUnfollow={handleUnfollow}
                onAcceptRequest={handleAcceptRequest}
                onDenyRequest={handleDenyRequest}
                onCancelRequest={handleCancelRequest}
                onFollow={handleFollow}
                onMessage={handleSendMessage}
            />
            <View style={styles.divider} />
            <ProfileTabs active={activeSection} onChange={setActiveSection} />
        </>
    );
}

export default React.memo(OtherUserProfileChrome);

const styles = StyleSheet.create({
    divider: { width: "100%", height: 1, backgroundColor: "lightgray", marginVertical: 10 },
});
