import React, { useEffect, useState } from "react";
import { View, StyleSheet, FlatList, InteractionManager } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { selectUser, fetchOtherUserSettings, selectOtherUserSettings, selectOtherUserName, fetchUserFullName } from "../../Slices/UserSlice";
import OtherUserHeader from './OtherUser/OtherUserHeader';
import FollowControls from './FollowControls';
import ProfileTabs from './ProfileTabs';
import {
  selectFollowRequests,
  selectFollowing,
  approveFollowRequest,
  cancelFollowRequest,
  declineFollowRequest,
  unfollowUser,
  selectOtherUserFollowers,
  selectOtherUserFollowing,
  fetchOtherUserFollowersAndFollowing,
  followBack,
} from "../../Slices/friendsSlice";
import Reviews from "../Reviews/Reviews";
import Photos from "./Photos";
import {
  fetchOtherUserBanner,
  resetOtherUserBanner,
  selectOtherUserBanner,
  fetchOtherUserProfilePic,
  resetOtherUserProfilePic,
  selectOtherUserProfilePic,
} from "../../Slices/PhotosSlice";
import {
  fetchPostsByOtherUserId,
  selectOtherUserReviews,
  resetOtherUserReviews,
  appendOtherUserReviews,
  setOtherUserReviews,
} from "../../Slices/ReviewsSlice";
import { createNotification } from "../../Slices/NotificationsSlice";
import Favorites from "./Favorites";
import { fetchOtherUserFavorites, selectOtherUserFavorites } from "../../Slices/FavoritesSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import ConnectionsModal from "./ConnectionsModal";
import { handleFollowUserHelper } from "../../utils/followHelper";
import { selectConversations, chooseUserToMessage } from "../../Slices/DirectMessagingSlice";
import useTaggedFeed from '../../hooks/useTaggedFeed';

export default function OtherUserProfile({ route, navigation }) {
  const { userId } = route.params;
  const mainUser = useSelector(selectUser);
  const dispatch = useDispatch();
  const followRequests = useSelector(selectFollowRequests);
  const otherUserFollowing = useSelector(selectOtherUserFollowing);
  const otherUserFollowers = useSelector(selectOtherUserFollowers);
  const following = useSelector(selectFollowing)
  const banner = useSelector(selectOtherUserBanner);
  const favorites = useSelector(selectOtherUserFavorites);
  const profileReviews = useSelector(selectOtherUserReviews);
  const otherUserProfilePic = useSelector(selectOtherUserProfilePic);
  const otherUserPrivacy = useSelector(selectOtherUserSettings);
  const fullName = useSelector(selectOtherUserName);
  const conversations = useSelector(selectConversations);
  const isPrivate = otherUserPrivacy?.profileVisibility === 'private';
  const [isRequestSent, setIsRequestSent] = useState(false);
  const [isRequestReceived, setIsRequestReceived] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [activeSection, setActiveSection] = useState("reviews");
  const [connectionsModalVisible, setConnectionsModalVisible] = useState(false);
  const [activeConnectionsTab, setActiveConnectionsTab] = useState("followers");
  const { loadMore, refresh, isLoading, hasMore } = usePaginatedFetch({
    fetchThunk: fetchPostsByOtherUserId,
    appendAction: appendOtherUserReviews,
    resetAction: setOtherUserReviews,
    params: { userId },
    limit: 5,
  });

  const { posts: taggedPosts, status: taggedStatus, hasMore: taggedHasMore, loadMore: loadMoreTagged } =
    useTaggedFeed(userId, activeSection, 15);

  useEffect(() => {
    if (userId) {
      dispatch(fetchOtherUserBanner(userId));
      dispatch(fetchUserFullName(userId));
      dispatch(fetchOtherUserProfilePic(userId));
      dispatch(fetchOtherUserFavorites(userId));
      dispatch(fetchOtherUserSettings(userId));
      dispatch(fetchOtherUserFollowersAndFollowing(userId));

      const task = InteractionManager.runAfterInteractions(() => {
        refresh();
      });

      return () => task.cancel();
    }
  }, [userId]);

  useEffect(() => {
    if (!mainUser || !followRequests || !following || !userId) return;

    const followingIds = following.map(u => u._id);
    const sentRequestIds = (followRequests?.sent || []).map(u => u._id || u);
    const receivedRequestIds = (followRequests?.received || []).map(u => u._id || u);

    setIsRequestSent(sentRequestIds.includes(userId));
    setIsRequestReceived(receivedRequestIds.includes(userId));
    setIsFollowing(followingIds.includes(userId));
  }, [mainUser, following, followRequests, userId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      dispatch(resetOtherUserBanner());
      dispatch(resetOtherUserReviews());
      dispatch(resetOtherUserProfilePic());
    });

    return unsubscribe;
  }, [navigation, dispatch]);

  const handleCancelRequest = async () => {
    await dispatch(cancelFollowRequest({ recipientId: userId }));
    // ✅ Explicitly update the state to ensure UI reflects the change
    setIsRequestSent(false);
  };

  const handleDenyRequest = () => dispatch(declineFollowRequest({ requesterId: userId }));

  const handleUnfollow = () => {
    dispatch(unfollowUser(userId));
    setDropdownVisible(false);
    setIsFollowing(false);
  };

  const handleFollowUser = () => {
    handleFollowUserHelper({
      isPrivate,
      userId,
      mainUser,
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

  const handleSendMessage = () => {
    const currentUserId = mainUser?.id;
    if (!currentUserId || !userId) return;

    const participantIds = [currentUserId, userId].sort();

    const existingConversation = conversations.find(conv => {
      const ids = (conv.participants || [])
        .map(p => (typeof p === 'object' ? p._id : p)?.toString())
        .filter(Boolean)
        .sort();

      return (
        ids.length === participantIds.length &&
        ids.every((id, index) => id === participantIds[index])
      );
    });

    // ✅ Construct the full recipient object payload
    const recipient = {
      _id: userId,
      firstName: fullName?.split(" ")[0] || "",
      lastName: fullName?.split(" ")[1] || "",
      profilePic: otherUserProfilePic || {},
      profilePicUrl: otherUserProfilePic?.url || "",
      privacySettings: otherUserPrivacy || {},
      following: otherUserFollowing || [],
    };

    dispatch(chooseUserToMessage([recipient]));

    navigation.navigate('MessageThread', {
      conversationId: existingConversation?._id || null,
      participants: [recipient],
    });
  };

  const photos = Array.from(
    new Set(profileReviews.flatMap((review) => review.photos?.map((photo) => photo.url) || []))
  ).map((url) => ({ url }));

 const data =
    activeSection === "photos" ? photos
    : activeSection === "favorites" ? favorites
    : [];

  const renderHeader = () => (
    <>
      <OtherUserHeader
        onBack={() => navigation.goBack()}
        bannerUrl={banner?.url}
        profilePicUrl={otherUserProfilePic?.url}
        fullName={fullName}
        followersCount={otherUserFollowers.length}
        followingCount={otherUserFollowing.length}
        openFollowers={() => { setActiveConnectionsTab('followers'); setConnectionsModalVisible(true); }}
        openFollowing={() => { setActiveConnectionsTab('following'); setConnectionsModalVisible(true); }}
      />
      <FollowControls
        isFollowing={isFollowing}
        isRequestSent={isRequestSent}
        isRequestReceived={isRequestReceived}
        onUnfollow={handleUnfollow}
        onAcceptRequest={handleAcceptRequest}
        onDenyRequest={handleDenyRequest}
        onCancelRequest={handleCancelRequest}
        onFollow={handleFollowUser}
        onMessage={handleSendMessage}
      />
      <View style={styles.divider} />
      <ProfileTabs active={activeSection} onChange={setActiveSection} />
      {activeSection === 'reviews' && (
        <Reviews
          reviews={profileReviews}
          onLoadMore={loadMore}
          isLoadingMore={isLoading}
          hasMore={hasMore}
        />
      )}
      {activeSection === 'tagged' && (
        <Reviews
          reviews={taggedPosts}                    // mixed types; your renderer should branch on __typename if needed
          onLoadMore={loadMoreTagged}
          isLoadingMore={taggedStatus === 'pending'}
          hasMore={taggedHasMore}
        />
      )}
      {activeSection === 'photos' && <Photos photos={photos} />}
      {activeSection === 'favorites' && <Favorites favorites={favorites} />}
      <ConnectionsModal
        visible={connectionsModalVisible}
        onClose={() => setConnectionsModalVisible(false)}
        followers={otherUserFollowers}
        following={otherUserFollowing}
        initialTab={activeConnectionsTab}
      />
    </>
  );

  return (
    <FlatList
      style={styles.container}
      data={data}
      keyExtractor={(item, index) => index.toString()}
      ListHeaderComponent={renderHeader()}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  divider: { width: "100%", height: 1, backgroundColor: "lightgray", marginVertical: 10 },
});