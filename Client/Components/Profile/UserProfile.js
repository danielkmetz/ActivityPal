import React, { useState, useEffect } from "react";
import { View, StyleSheet, FlatList, InteractionManager } from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import EditProfileModal from "./EditProfileModal";
import Reviews from "../Reviews/Reviews";
import Photos from "./Photos";
import ProfileTabs from "./ProfileTabs";
import SelfProfileHeader from './SelfProfileHeader';
import profilePlaceholder from '../../assets/pics/profile-pic-placeholder.jpg'
import { selectProfilePic, selectBanner, fetchUserBanner } from "../../Slices/PhotosSlice";
import { selectProfileReviews, fetchReviewsByUserId, appendProfileReviews, setProfileReviews } from "../../Slices/ReviewsSlice";
import { selectFavorites, fetchFavorites } from "../../Slices/FavoritesSlice";
import Favorites from "./Favorites";
import { selectFollowing, selectFollowers } from "../../Slices/friendsSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import ConnectionsModal from "./ConnectionsModal";
import { useNavigation } from "@react-navigation/native";
import { clearTodayEngagementLog } from "../../Slices/EngagementSlice";
import useTaggedFeed from "../../hooks/useTaggedFeed";

export default function UserProfile() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const profilePic = useSelector(selectProfilePic);
  const profileReviews = useSelector(selectProfileReviews);
  const following = useSelector(selectFollowing);
  const followers = useSelector(selectFollowers);
  const banner = useSelector(selectBanner);
  const [activeSection, setActiveSection] = useState("reviews");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(true);
  const [connectionsModalVisible, setConnectionsModalVisible] = useState(false);
  const [activeConnectionsTab, setActiveConnectionsTab] = useState("followers");
  const favorites = useSelector(selectFavorites);
  const fullName = `${user?.firstName} ${user?.lastName}`;
  const bannerPlaceholder = null;
  const userId = user?.id;
  const { loadMore, refresh, isLoading, hasMore } = usePaginatedFetch({
    fetchThunk: fetchReviewsByUserId,
    appendAction: appendProfileReviews,
    resetAction: setProfileReviews,
    params: { userId },
    limit: 5,
  });
  const { posts: taggedPosts, status: taggedStatus, hasMore: taggedHasMore, loadMore: loadMoreTagged } =
    useTaggedFeed(userId, activeSection, 15);

  useEffect(() => {
    if (userId && shouldFetch) {
      dispatch(fetchUserBanner(userId));
      dispatch(fetchFavorites(userId));

      const task = InteractionManager.runAfterInteractions(() => {
        refresh();
      });

      setShouldFetch(false);
      return () => task.cancel();
    }
  }, [userId]);

  const photos = Array.from(
    new Set(profileReviews.flatMap((review) => review.photos?.map((photo) => photo.url) || []))
  ).map((url) => ({ url }));

  const data =
    activeSection === "photos" ? photos
      : activeSection === "favorites" ? favorites
        : []; // reviews & tagged render via header component, not FlatList data

  const openFollowers = () => {
    setActiveConnectionsTab("followers");
    setConnectionsModalVisible(true);
  };
  const openFollowing = () => {
    setActiveConnectionsTab("following");
    setConnectionsModalVisible(true);
  };

  const renderHeader = () => (
    <>
      <SelfProfileHeader
        bannerUrl={banner?.url}
        profilePicUrl={profilePic?.url}
        fullName={fullName}
        followersCount={followers.length}
        followingCount={following.length}
        onOpenFollowers={openFollowers}
        onOpenFollowing={openFollowing}
        onEditProfile={() => setEditModalVisible(true)}
        onSettings={() => navigation.navigate("Settings")}
        onClearLog={clearTodayEngagementLog}
      />
      <View style={styles.divider} />
      <ProfileTabs active={activeSection} onChange={setActiveSection} />
      {activeSection === "reviews" && (
        <Reviews
          reviews={profileReviews}
          onLoadMore={loadMore}
          isLoadingMore={isLoading}
          hasMore={hasMore}
        />
      )}
      {activeSection === "tagged" && (
        <Reviews
          reviews={taggedPosts}                 // mixed: Review + CheckIn (branch in renderer if needed)
          onLoadMore={loadMoreTagged}
          isLoadingMore={taggedStatus === 'pending'}
          hasMore={taggedHasMore}
        />
      )}
      {activeSection === "photos" && <Photos photos={photos} />}
      {activeSection === "favorites" && <Favorites favorites={favorites} />}
      <View style={{ marginBottom: 100 }} />
      <ConnectionsModal
        visible={connectionsModalVisible}
        onClose={() => setConnectionsModalVisible(false)}
        followers={followers}
        following={following}
        initialTab={activeConnectionsTab}
      />
    </>
  );

  return (
    <>
      <FlatList
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader()}
        data={data}
        keyExtractor={(item, index) => index.toString()}
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
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  divider: { width: "100%", height: 1, backgroundColor: "lightgray", marginVertical: 10 },
});