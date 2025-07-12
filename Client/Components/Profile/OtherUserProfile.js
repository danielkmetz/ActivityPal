import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { selectUser, fetchOtherUserSettings, selectOtherUserSettings, selectOtherUserName, fetchUserFullName } from "../../Slices/UserSlice";
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
} from "../../Slices/friendsSlice";
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
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
  const isPrivate = otherUserPrivacy?.profileVisibility === 'private';
  const [isRequestSent, setIsRequestSent] = useState(false);
  const [isRequestReceived, setIsRequestReceived] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [activeSection, setActiveSection] = useState("reviews");
  const [connectionsModalVisible, setConnectionsModalVisible] = useState(false);
  const [activeConnectionsTab, setActiveConnectionsTab] = useState("followers");

  const {
    loadMore,
    refresh,
    isLoading,
    hasMore,
  } = usePaginatedFetch({
    fetchThunk: fetchPostsByOtherUserId,
    appendAction: appendOtherUserReviews,
    resetAction: setOtherUserReviews,
    params: { userId },
    limit: 5,
  });

  useEffect(() => {
    if (userId) {
      dispatch(fetchOtherUserBanner(userId));
      dispatch(fetchUserFullName(userId));
      refresh();
      dispatch(fetchOtherUserProfilePic(userId));
      dispatch(fetchOtherUserFavorites(userId));
      dispatch(fetchOtherUserSettings(userId));
      dispatch(fetchOtherUserFollowersAndFollowing(userId));
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

  const photos = Array.from(
    new Set(profileReviews.flatMap((review) => review.photos?.map((photo) => photo.url) || []))
  ).map((url) => ({ url }));

  const data = activeSection === "reviews" ? profileReviews : photos;

  const renderHeader = () => (
    <>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="chevron-back" size={24} color="gray" />
      </TouchableOpacity>
      <Image source={{ uri: banner?.url }} style={styles.coverPhoto} />
      <View style={styles.profileHeader}>
        <Image
          source={otherUserProfilePic?.url ? { uri: otherUserProfilePic?.url } : profilePicPlaceholder}
          style={styles.profilePicture}
        />
        <View style={styles.nameAndFollow}>
          <Text style={styles.userName}>{fullName}</Text>
          <View style={styles.connections}>
            <TouchableOpacity
              onPress={() => {
                setActiveConnectionsTab("followers");
                setConnectionsModalVisible(true);
              }}
            >
              <View style={[styles.followers, { marginRight: 15 }]}>
                <Text style={styles.followGroup}>Followers</Text>
                <Text style={[styles.followText, { fontSize: 18 }]}>{otherUserFollowers.length}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setActiveConnectionsTab("following");
                setConnectionsModalVisible(true);
              }}
            >
              <View style={styles.followers}>
                <Text style={styles.followGroup}>Following</Text>
                <Text style={[styles.followText, { fontSize: 18 }]}>{otherUserFollowing.length}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {isFollowing ? (
        <>
          <TouchableOpacity
            style={styles.friendsButton}
            onPress={() => setDropdownVisible(!dropdownVisible)}
          >
            <Text style={styles.friendsText}>Following</Text>
          </TouchableOpacity>
          {dropdownVisible && (
            <View style={styles.dropdown}>
              <TouchableOpacity style={styles.dropdownItem} onPress={handleUnfollow}>
                <Text style={styles.dropdownText}>Unfollow</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : isRequestReceived ? (
        <View style={styles.requestButtonsContainer}>
          <TouchableOpacity style={styles.acceptRequestButton} onPress={handleAcceptRequest}>
            <Text style={styles.acceptRequestText}>Accept Request</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.denyRequestButton} onPress={handleDenyRequest}>
            <Text style={styles.denyRequestText}>Deny Request</Text>
          </TouchableOpacity>
        </View>
      ) : isRequestSent ? (
        <TouchableOpacity style={styles.cancelRequestButton} onPress={handleCancelRequest}>
          <Text style={styles.cancelRequestText}>Cancel Request</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.addFriendButton} onPress={handleFollowUser}>
          <Text style={styles.addFriendText}>Follow</Text>
        </TouchableOpacity>
      )}
      <View style={styles.divider} />
      <View style={styles.navButtonsContainer}>
        {["reviews", "photos", "favorites"].map((section) => (
          <TouchableOpacity
            key={section}
            style={styles.navTab}
            onPress={() => setActiveSection(section)}
          >
            <Text style={[styles.navTabText, activeSection === section && styles.activeTabText]}>
              {section === "reviews" ? "Posts" : section.charAt(0).toUpperCase() + section.slice(1)}
            </Text>
            {activeSection === section && <View style={styles.navUnderline} />}
          </TouchableOpacity>
        ))}
      </View>
      {activeSection === "reviews" && <Reviews reviews={profileReviews} onLoadMore={loadMore} isLoadingMore={isLoading} hasMore={hasMore} />}
      {activeSection === "photos" && <Photos photos={photos} />}
      {activeSection === "favorites" && <Favorites favorites={favorites} />}
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
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 20,
    padding: 8,
  },
  coverPhoto: {
    width: "100%",
    height: 200,
  },
  profileHeader: {
    alignItems: "left",
    marginTop: -50,
    marginBottom: 20,
    marginLeft: 20,
    flexDirection: 'row',
  },
  nameAndFollow: {
    flexDirection: 'column',
    marginLeft: 15,
    marginTop: 50,
  },
  connections: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  followers: {
    flexDirection: 'column',
  },
  followGroup: {
    fontSize: 13,
  },
  followText: {
    alignSelf: 'flex-start',
    fontWeight: 'bold',
  },
  profilePicture: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: "#fff",
  },
  userName: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 10,
  },
  userEmail: {
    fontSize: 16,
    color: "#555",
  },
  addFriendButton: {
    backgroundColor: "#009999",
    marginHorizontal: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 20,
  },
  addFriendText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelRequestButton: {
    backgroundColor: "gray",
    marginHorizontal: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 20,
  },
  cancelRequestText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  friendsButton: {
    backgroundColor: "gray",
    marginHorizontal: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 20,
  },
  friendsText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  dropdown: {
    backgroundColor: "#fff",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    marginHorizontal: 30,
    padding: 10,
    width: '40%',
  },
  dropdownItem: {
    paddingVertical: 10,
    alignItems: "center",
  },
  dropdownText: {
    color: "red",
    fontSize: 16,
    fontWeight: "bold",
  },
  requestButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginHorizontal: 20,
    marginTop: 20,
  },
  acceptRequestButton: {
    backgroundColor: "green",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  acceptRequestText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  denyRequestButton: {
    backgroundColor: "red",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: "center",
    flex: 1,
    marginLeft: 10,
  },
  denyRequestText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "lightgray", // Line color
    marginVertical: 10, // Spacing above and below the line
  },
  navButtonsContainer: {
    flexDirection: "row",
    marginBottom: 5,
    marginLeft: 20,
    gap: 25,
  },
  navTab: {
    alignItems: "center",

  },
  navTabText: {
    fontSize: 16,
    color: "#555",
    fontWeight: "600",
  },
  activeTabText: {
    color: "#009999",
    fontWeight: "bold",
  },
  navUnderline: {
    height: 2,
    backgroundColor: "#009999",
    width: "100%",
    marginTop: 4,
    borderRadius: 2,
  },
  reviews: {
    marginTop: 10,
  }

});
