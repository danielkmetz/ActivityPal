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
import { selectProfileReviews, fetchReviewsByUserId, appendProfileReviews, setProfileReviews } from "../../Slices/ReviewsSlice";
import { selectFavorites, fetchFavorites } from "../../Slices/FavoritesSlice";
import Favorites from "./Favorites";
import { selectFollowing, selectFollowers } from "../../Slices/friendsSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import ConnectionsModal from "./ConnectionsModal";

export default function UserProfile() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const profilePic = useSelector(selectProfilePic);
  const profileReviews = useSelector(selectProfileReviews);
  const following = useSelector(selectFollowing);
  const followers = useSelector(selectFollowers);
  const banner = useSelector(selectBanner);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState("reviews");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(true);
  const [connectionsModalVisible, setConnectionsModalVisible] = useState(false);
  const [activeConnectionsTab, setActiveConnectionsTab] = useState("followers");
  const favorites = useSelector(selectFavorites);

  const bannerPlaceholder = null;
  const userId = user?.id;

  const {
    loadMore,
    refresh,
    isLoading,
    hasMore,
  } = usePaginatedFetch({
    fetchThunk: fetchReviewsByUserId,
    appendAction: appendProfileReviews,
    resetAction: setProfileReviews,
    params: { userId },
    limit: 5,
  });

  useEffect(() => {
    if (userId && shouldFetch) {
      dispatch(fetchProfilePic(userId));
      dispatch(fetchUserBanner(userId));
      dispatch(fetchFavorites(userId));
      refresh();
      setShouldFetch(false)
    }
  }, [userId]);

  const photos = Array.from(
    new Set(profileReviews.flatMap((review) => review.photos?.map((photo) => photo.url) || []))
  ).map((url) => ({ url }));

  const data = activeSection === "reviews" ? profileReviews : photos;

  return (
    <>
      <FlatList
        showsVerticalScrollIndicator={false}
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
              <View style={styles.nameAndFollow}>
                <Text style={styles.userName}>{`${user.firstName} ${user.lastName}`}</Text>
                <View style={styles.connections}>
                  <TouchableOpacity
                    onPress={() => {
                      setActiveConnectionsTab("followers");
                      setConnectionsModalVisible(true);
                    }}
                  >
                    <View style={[styles.followers, { marginRight: 15 }]}>
                      <Text style={styles.followGroup}>Followers</Text>
                      <Text style={[styles.followText, { fontSize: 18 }]}>{followers.length}</Text>
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
                      <Text style={[styles.followText, { fontSize: 18 }]}>{following.length}</Text>
                    </View>
                  </TouchableOpacity>
                </View>

              </View>
            </View>
            <View style={styles.editContainer}>
              <View style={styles.editButtons}>
                <TouchableOpacity
                  style={styles.editProfileButton}
                  onPress={() => setEditModalVisible(true)}
                >
                  <Ionicons name="pencil" size={20} color="white" />
                  <Text style={styles.editProfileButtonText}>Edit Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editProfileButton, { marginLeft: 10, }]}
                  onPress={() => setModalVisible(true)}
                >
                  <Ionicons name="settings-sharp" size={24} color="white" />
                  <Text style={styles.editProfileButtonText}>Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
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
            <View style={styles.bottom} />
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
      <ConnectionsModal
        visible={connectionsModalVisible}
        onClose={() => setConnectionsModalVisible(false)}
        followers={followers}
        following={following}
        initialTab={activeConnectionsTab}
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
    marginTop: -50,
    marginBottom: 10,
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
    marginTop: 15,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "lightgray",
    marginVertical: 10,
  },
  navButtonsContainer: {
    flexDirection: "row",
    marginBottom: 5,
    marginLeft: 15,
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
  bannerPlaceholder: {
    width: "100%",
    height: 200,
    backgroundColor: "teal",
  },
  bottom: {
    marginBottom: 100,
  }
});
