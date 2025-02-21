import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { 
  selectFriends, 
  selectFriendRequests, 
  sendFriendRequest, 
  cancelFriendRequest, 
  acceptFriendRequest, 
  removeFriend, 
  declineFriendRequest 
} from "../../Slices/UserSlice";
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
  fetchReviewsByOtherUserId, 
  selectOtherUserReviews, 
  resetOtherUserReviews, 
} from "../../Slices/ReviewsSlice";
import { createNotification } from "../../Slices/NotificationsSlice";
import { selectUser } from "../../Slices/UserSlice";

export default function OtherUserProfile({ route, navigation }) {
  const { user } = route.params;
  const mainUser = useSelector(selectUser);
  const dispatch = useDispatch();
  const friendRequests = useSelector(selectFriendRequests);
  const banner = useSelector(selectOtherUserBanner);
  const friends = useSelector(selectFriends);
  const profileReviews = useSelector(selectOtherUserReviews);
  const otherUserProfilePic = useSelector(selectOtherUserProfilePic);
  const [isRequestSent, setIsRequestSent] = useState(false);
  const [isRequestReceived, setIsRequestReceived] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [activeSection, setActiveSection] = useState("reviews");

  useEffect(() => {
    if (user) {
      dispatch(fetchOtherUserBanner(user._id));
      dispatch(fetchReviewsByOtherUserId(user._id));
      dispatch(fetchOtherUserProfilePic(user._id));
    }
  }, [user]);

  useEffect(() => {
    setIsRequestSent(friendRequests.sent.includes(user._id));
    setIsRequestReceived(friendRequests.received.includes(user._id));
    setIsFriend(friends.includes(user._id));
  }, [friendRequests, friends, user]);

  const handleCancelRequest = async () => {
    await dispatch(cancelFriendRequest(user._id));

    // ✅ Explicitly update the state to ensure UI reflects the change
    setIsRequestSent(false);
  };

  const handleDenyRequest = () => dispatch(declineFriendRequest(user._id));
  const handleRemoveFriend = () => {
    dispatch(removeFriend(user._id));
    setDropdownVisible(false);
  };

  const handleAddFriend = async () => {
    await dispatch(sendFriendRequest(user._id));

    // ✅ Create a notification for the recipient
    await dispatch(createNotification({
        userId: user._id, // Receiver of the notification
        type: 'friendRequest',
        message: `${mainUser.firstName} ${mainUser.lastName} sent you a friend request.`,
        relatedId: mainUser.id,
        typeRef: 'User'
    }));
  };

  const handleAcceptRequest = async () => {
      await dispatch(acceptFriendRequest(user._id));

      // ✅ Create a notification for the original sender
      await dispatch(createNotification({
          userId: user._id, // The user who sent the friend request
          type: 'friendRequestAccepted',
          message: `${user.firstName} accepted your friend request!`,
          relatedId: user._id,
          typeRef: 'User'
      }));
  };

  const photos = Array.from(
    new Set(profileReviews.flatMap((review) => review.photos?.map((photo) => photo.url) || []))
  ).map((url) => ({ url }));

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
      {isFriend ? (
        <>
          <TouchableOpacity
            style={styles.friendsButton}
            onPress={() => setDropdownVisible(!dropdownVisible)}
          >
            <Text style={styles.friendsText}>Friends</Text>
          </TouchableOpacity>
          {dropdownVisible && (
            <View style={styles.dropdown}>
              <TouchableOpacity style={styles.dropdownItem} onPress={handleRemoveFriend}>
                <Text style={styles.dropdownText}>Remove Friend</Text>
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
        <TouchableOpacity style={styles.addFriendButton} onPress={handleAddFriend}>
          <Text style={styles.addFriendText}>Add Friend</Text>
        </TouchableOpacity>
      )}
      <View style={styles.divider} />
      <View style={styles.navButtonsContainer}>
        <TouchableOpacity
          style={[styles.navButton, activeSection === "reviews" && styles.activeButton]}
          onPress={() => setActiveSection("reviews")}
        >
          <Text style={styles.navButtonText}>My Reviews</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeSection === "photos" && styles.activeButton]}
          onPress={() => setActiveSection("photos")}
        >
          <Text style={styles.navButtonText}>Photos</Text>
        </TouchableOpacity>
      </View>
      {activeSection === "reviews" && <Reviews reviews={profileReviews} />}
      {activeSection === "photos" && <Photos photos={photos} />}
    </>
  );

  return (
    <FlatList
      style={styles.container}
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
