import React, { useState, useEffect, } from "react";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, Image, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import SettingsModal from "./SettingsModal";
import EditProfileModal from "./EditProfileModal";
import Reviews from "../Reviews/Reviews";
import Photos from "./Photos";
import profilePlaceholder from '../../assets/pics/profile-pic-placeholder.jpg'
import { selectProfilePic, selectBanner, fetchProfilePic, fetchUserBanner } from "../../Slices/PhotosSlice";
import { selectProfileReviews, fetchReviewsByUserId } from "../../Slices/ReviewsSlice";
import { selectFavorites, fetchFavorites } from "../../Slices/FavoritesSlice";
import Favorites from "./Favorites";

export default function UserProfile() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const profilePic = useSelector(selectProfilePic);
  const profileReviews = useSelector(selectProfileReviews);
  const banner = useSelector(selectBanner);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState("reviews");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(true);
  const favorites = useSelector(selectFavorites);
  
  const bannerPlaceholder = null;
  const userId = user?.id;
  const numberOfFriends = user?.friends?.length;

  useEffect(() => {
    if (userId && shouldFetch) {
      dispatch(fetchProfilePic(userId));
      dispatch(fetchUserBanner(userId));
      dispatch(fetchReviewsByUserId(userId));
      dispatch(fetchFavorites(userId));

      setShouldFetch(false)
    }
  }, [userId, dispatch]);

  const photos = Array.from(
    new Set(profileReviews.flatMap((review) => review.photos?.map((photo) => photo.url) || []))
  ).map((url) => ({ url }));

  const data = activeSection === "reviews" ? profileReviews : photos;

  return (
    <>
      <FlatList
        ListHeaderComponent={
          <>
            {banner ? (
              <Image source={{ uri: banner?.url }} style={styles.coverPhoto} />
            ) : (
              <View style={styles.bannerPlaceholder} />
            )}
            <View style={styles.profileHeader}>
              <Image 
                source={profilePic?.url ? { uri: profilePic?.url } : profilePlaceholder} 
                style={styles.profilePicture} 
              />
              <Text style={styles.userName}>{`${user.firstName} ${user.lastName}`}</Text>
            </View>
            <View style={styles.editContainer}>
              <Text style={styles.userEmail}>Friends: {numberOfFriends}</Text>
              <View style={styles.editButtons}>
                <TouchableOpacity
                  style={styles.editProfileButton}
                  onPress={() => setEditModalVisible(true)}
                >
                  <Ionicons name="pencil" size={20} color="white" />
                  <Text style={styles.editProfileButtonText}>Edit Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.settingsIcon}
                  onPress={() => setModalVisible(true)}
                >
                  <Ionicons name="settings-sharp" size={24} color="gray" />
                </TouchableOpacity>
              </View>
            </View>
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
                <Text style={styles.navButtonText}>Favorited</Text>
              </TouchableOpacity>
            </View>
            {activeSection === "reviews" && <Reviews reviews={profileReviews} />}
            {activeSection === "photos" && <Photos photos={photos} />}
            {activeSection === "favorites" && <Favorites favorites={favorites} />}
          </>
        }
        data={data} 
        keyExtractor={(item, index) => index.toString()}   
      />
      <SettingsModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
      <EditProfileModal
        visible={editModalVisible}
        setEditModalVisible={setEditModalVisible}
        onClose={() => setEditModalVisible(false)}
        bannerPlaceholder={bannerPlaceholder}
        profilePicPlaceholder={profilePlaceholder}
        aboutInfo={{}}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  coverPhoto: {
    width: "100%",
    height: 200,
  },
  profileHeader: {
    alignItems: "left",
    marginTop: -80,
    marginBottom: 10,
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
    marginTop: 5,
  },
  editContainer: {
    flexDirection: "row",
    marginLeft: 20,
    justifyContent: "space-between",
  },
  settingsIcon: {
    padding: 5,
    marginLeft: 10,
  },
  editProfileButton: {
    backgroundColor: "gray",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  editProfileButtonText: {
    color: "white",
    marginLeft: 5,
    fontWeight: "bold",
  },
  editButtons: {
    flexDirection: "row",
    marginRight: 20,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "lightgray",
    marginVertical: 10,
  },
  navButtonsContainer: {
    flexDirection: "row",
    marginVertical: 10,
    marginLeft: 15,
  },
  navButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
  },
  activeButton: {
    backgroundColor: "rgba(144, 238, 144, 0.4)",
  },
  navButtonText: {
    color: "black",
    fontWeight: "bold",
  },
  bannerPlaceholder: {
    width: "100%",
    height: 200,
    backgroundColor: "teal",
  },
});
