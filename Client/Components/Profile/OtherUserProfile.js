import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { selectUser, fetchOtherUserSettings, selectOtherUserSettings } from "../../Slices/UserSlice";
import { 
  selectFollowRequests, 
  selectFollowing, 
  acceptFollowRequest,
  sendFollowRequest,
  cancelFollowRequest,
  declineFollowRequest,
  unfollowUser,
  followUserImmediately,
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

export default function OtherUserProfile({ route, navigation }) {
  const { user } = route.params;
  const userId = user?._id;
  const mainUser = useSelector(selectUser);
  const dispatch = useDispatch();
  const followRequests = useSelector(selectFollowRequests);
  const banner = useSelector(selectOtherUserBanner);
  const following = useSelector(selectFollowing);
  const favorites = useSelector(selectOtherUserFavorites);
  const profileReviews = useSelector(selectOtherUserReviews);
  const otherUserProfilePic = useSelector(selectOtherUserProfilePic);
  const otherUserPrivacy = useSelector(selectOtherUserSettings);
  const isPrivate = otherUserPrivacy?.profileVisibility === 'private';
  const [isRequestSent, setIsRequestSent] = useState(false);
  const [isRequestReceived, setIsRequestReceived] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [activeSection, setActiveSection] = useState("reviews");

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
    if (user) {
      dispatch(fetchOtherUserBanner(user._id));
      refresh();
      dispatch(fetchOtherUserProfilePic(user._id));
      dispatch(fetchOtherUserFavorites(user._id));
      dispatch(fetchOtherUserSettings(user._id));
    }
  }, [user]);

  useEffect(() => {
    setIsRequestSent(followRequests.sent.includes(user._id));
    setIsRequestReceived(followRequests.received.includes(user._id));
    setIsFollowing(following.includes(user._id));
  }, [followRequests, following, user]);

  const handleCancelRequest = async () => {
    await dispatch(cancelFollowRequest(user._id));
    // ✅ Explicitly update the state to ensure UI reflects the change
    setIsRequestSent(false);
  };

  const handleDenyRequest = () => dispatch(declineFollowRequest(user._id));
  const handleUnfollow = () => {
    dispatch(unfollowUser(user._id));
    setDropdownVisible(false);
  };

  const handleFollowUser = async () => {
    try {
      if (isPrivate) {
        await dispatch(sendFollowRequest(user._id));
        await dispatch(createNotification({
          userId: user._id,
          type: 'followRequest',
          message: `${mainUser.firstName} ${mainUser.lastName} wants to follow you.`,
          relatedId: mainUser.id,
          typeRef: 'User',
        }));
      } else {
        await dispatch(followUserImmediately(user._id));
        await dispatch(createNotification({
          userId: user._id,
          type: 'follow',
          message: `${mainUser.firstName} ${mainUser.lastName} started following you.`,
          relatedId: mainUser.id,
          typeRef: 'User',
        }));
      }
    } catch (err) {
      console.error("Failed to follow user:", err);
    }
  };
  
  const handleAcceptRequest = async () => {
      await dispatch(acceptFollowRequest(user._id));

      // ✅ Create a notification for the original sender
      await dispatch(createNotification({
          userId: user._id, // The user who sent the friend request
          type: 'followAccepted',
          message: `${user.firstName} accepted your follow request!`,
          relatedId: user._id,
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
        onPress={() => {
          dispatch(resetOtherUserBanner());
          dispatch(resetOtherUserReviews());
          dispatch(resetOtherUserProfilePic());
          navigation.goBack();
        }}
      >
        <Ionicons name="chevron-back" size={24} color="gray" />
      </TouchableOpacity>
      <Image source={{ uri: banner?.url }} style={styles.coverPhoto} />
      <View style={styles.profileHeader}>
        <Image 
          source={otherUserProfilePic?.url ? { uri: otherUserProfilePic?.url } : profilePicPlaceholder} 
          style={styles.profilePicture} 
        />
        <Text style={styles.userName}>{`${user.firstName} ${user.lastName}`}</Text>
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
        <TouchableOpacity
          style={[styles.navButton, activeSection === "reviews" && styles.activeButton]}
          onPress={() => setActiveSection("reviews")}
        >
          <Text style={styles.navButtonText}>Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeSection === "photos" && styles.activeButton]}
          onPress={() => setActiveSection("photos")}
        >
          <Text style={styles.navButtonText}>Photos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeSection === "favorites" && styles.activeButton]}
          onPress={() => setActiveSection("favorites")}
        >
          <Text style={styles.navButtonText}>Favorites</Text>
        </TouchableOpacity>
      </View>
      {activeSection === "reviews" && <Reviews reviews={profileReviews} onLoadMore={loadMore} isLoadingMore={isLoading} hasMore={hasMore}/>}
      {activeSection === "photos" && <Photos photos={photos} />}
      {activeSection === "favorites" && <Favorites favorites={favorites} />}
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
    backgroundColor: "#007bff",
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
    //justifyContent: "space-around",
    //marginVertical: 10,
    marginLeft: 15,
  },
  navButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
  },
  activeButton: {
    backgroundColor: 'rgba(144, 238, 144, 0.4)',
  },
  navButtonText: {
    color: "black",
    fontWeight: "bold",
  },
  reviews: {
    marginTop: 10,
  }
  
});
