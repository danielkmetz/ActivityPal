import React, { useState, useEffect, useMemo } from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { approveFollowRequest, declineFollowRequest, cancelFollowRequest, selectFollowRequests, selectFollowing } from "../../../Slices/friendsSlice";
import { handleFollowUser } from "../../../utils/userActions";
import { createNotification } from "../../../Slices/NotificationsSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../../Slices/UserSlice";

export default function FollowButton({
  onPressFollowing, // when user taps "Following" (opens profile)
  post,
}) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const postContent = post?.original ?? post ?? {};
  const { isSuggestedFollowPost } = postContent;
  const postOwnerId = postContent?.userId;
  const isPrivate = postContent?.privacySettings?.public !== 'public';
  const targetId = useMemo(() => String(postOwnerId || ""), [postOwnerId]);
  const following = useSelector(selectFollowing);
  const followRequests = useSelector(selectFollowRequests);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isRequestReceived, setIsRequestReceived] = useState(false);
  const [isRequestSent, setIsRequestSent] = useState(false);
  const fullName = `${user?.firstName} ${user?.lastName}`

  if (!isSuggestedFollowPost) return null;

  useEffect(() => {
    if (!user || !followRequests || !following) return;

    const followingIds = following.map(u => u._id);
    const sentRequestIds = (followRequests?.sent || []).map(u => u._id || u);
    const receivedRequestIds = (followRequests?.received || []).map(u => u._id || u);

    setIsRequestSent(sentRequestIds.includes(postOwnerId));
    setIsRequestReceived(receivedRequestIds.includes(postOwnerId));
    setIsFollowing(followingIds.includes(postOwnerId));
  }, [user, following, followRequests, postOwnerId]);

  const onFollow = () =>
    handleFollowUser({
      isPrivate,                // boolean
      userId: postOwnerId,      // target
      mainUser: user,           // current user object from Redux
      dispatch,
      setIsFollowing,           // state setter from component
      setIsRequestSent,         // state setter from component
    });

   const onAcceptRequest = async () => {
    await dispatch(approveFollowRequest({ requesterId: targetId }));
    setIsFollowing(true);
    setIsRequestReceived(false);

    await dispatch(
      createNotification({
        userId: targetId,          // notify the requester
        type: "followAccepted",
        message: `${fullName} accepted your follow request!`,
        relatedId: user?.id,       // the acceptor (you)
        typeRef: "User",
      })
    );
  };

  const onDenyRequest = () => dispatch(declineFollowRequest({ requesterId: targetId }));

  const onCancelRequest = async () => {
    await dispatch(cancelFollowRequest({ recipientId: postOwnerId }));
    // ✅ Explicitly update the state to ensure UI reflects the change
    setIsRequestSent(false);
  };

  if (isFollowing) {
    return (
      <TouchableOpacity style={s.followButton} onPress={onPressFollowing}>
        <Text style={s.followingText}>Following</Text>
      </TouchableOpacity>
    );
  }

  if (isRequestReceived) {
    return (
      <View style={s.requestButtonsContainer}>
        <TouchableOpacity style={s.acceptRequestButton} onPress={onAcceptRequest}>
          <Text style={s.acceptRequestText}>Accept Request</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.followButton} onPress={onDenyRequest}>
          <Text style={s.followButtonText}>Deny Request</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isRequestSent) {
    return (
      <TouchableOpacity style={s.followButton} onPress={onCancelRequest}>
        <Text style={s.followButtonText}>Cancel Request</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={s.followButton} onPress={onFollow}>
      <Text style={s.followButtonText}>Follow</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  requestButtonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  acceptRequestButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#2c7a7b", // teal-ish accept
  },
  acceptRequestText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
  },
  followButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#b3b3b3",
  },
  followButtonText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
  },
  followingText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
  },
});
