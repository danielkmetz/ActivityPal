import React, { useState, useEffect, useMemo } from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { approveFollowRequest, declineFollowRequest, cancelFollowRequest, selectFollowRequests, selectFollowing } from "../../../Slices/friendsSlice";
import { handleFollowUser } from "../../../utils/userActions";
import { createNotification } from "../../../Slices/NotificationsSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../../Slices/UserSlice";

export default function FollowButton({
  onPressFollowing,
  post,
  // NEW props ↓↓↓
  targetId: targetIdProp,          // user id you want to follow (e.g., tagged user)
  forceVisible = false,            // bypass isSuggestedFollowPost gate (use in modal)
  compact = false,                 // smaller chip for inline rows
  targetIsPrivate = null,          // if you know it; otherwise we fall back to post privacy
}) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const postContent = post?.original ?? post ?? {};
  const { isSuggestedFollowPost } = postContent;
  const postOwnerId = postContent?.userId;
  const postIsPrivate = postContent?.privacySettings?.public !== "public";

  // Use targetIdProp when provided (e.g., modal rows), else fall back to post owner
  const targetId = useMemo(
    () => String(targetIdProp || postOwnerId || ""),
    [targetIdProp, postOwnerId]
  );

  const following = useSelector(selectFollowing) || [];
  const followRequests = useSelector(selectFollowRequests) || {};
  const [isFollowing, setIsFollowing] = useState(false);
  const [isRequestReceived, setIsRequestReceived] = useState(false);
  const [isRequestSent, setIsRequestSent] = useState(false);

  const fullName = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

  // Keep the old behavior unless forceVisible is true
  if (!forceVisible && !isSuggestedFollowPost) return null;
  if (!targetId || !user?.id) return null; // nothing to do

  useEffect(() => {
    const followingIds = following.map(u => String(u?._id ?? u?.id ?? u));
    const sentRequestIds = (followRequests?.sent || []).map(u => String(u?._id ?? u));
    const receivedRequestIds = (followRequests?.received || []).map(u => String(u?._id ?? u));

    setIsRequestSent(sentRequestIds.includes(targetId));
    setIsRequestReceived(receivedRequestIds.includes(targetId));
    setIsFollowing(followingIds.includes(targetId));
  }, [following, followRequests, targetId]);

  const onFollow = () =>
    handleFollowUser({
      isPrivate: targetIsPrivate ?? postIsPrivate, // prefer explicit, fall back to post privacy
      userId: targetId,                             // IMPORTANT: follow the tagged user
      mainUser: user,
      dispatch,
      setIsFollowing,
      setIsRequestSent,
    });

  const onAcceptRequest = async () => {
    await dispatch(approveFollowRequest(targetId));
    setIsFollowing(true);
    setIsRequestReceived(false);

    await dispatch(
      createNotification({
        userId: targetId,
        type: "followAccepted",
        message: `${fullName} accepted your follow request!`,
        relatedId: user?.id,
        typeRef: "User",
      })
    );
  };

  const onDenyRequest = () => dispatch(declineFollowRequest(targetId));

  const onCancelRequest = async () => {
    await dispatch(cancelFollowRequest(targetId));
    setIsRequestSent(false);
  };

  const btn = compact ? styles.followButtonSm : styles.followButton;
  const txt = compact ? styles.followButtonTextSm : styles.followButtonText;

  if (isFollowing) {
    return (
      <TouchableOpacity style={btn} onPress={onPressFollowing}>
        <Text style={txt}>Following</Text>
      </TouchableOpacity>
    );
  }

  if (isRequestReceived) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TouchableOpacity style={btn} onPress={onAcceptRequest}>
          <Text style={txt}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity style={btn} onPress={onDenyRequest}>
          <Text style={txt}>Deny</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isRequestSent) {
    return (
      <TouchableOpacity style={btn} onPress={onCancelRequest}>
        <Text style={txt}>Cancel</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={btn} onPress={onFollow}>
      <Text style={txt}>Follow</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  followButtonSm: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#b3b3b3",
  },
  followButtonTextSm: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
