import React, { useState, useEffect, useMemo } from "react";
import { View, StyleSheet, FlatList, InteractionManager } from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { useNavigation } from "@react-navigation/native";

import { selectUser } from "../../Slices/UserSlice";
import EditProfileModal from "./EditProfileModal";
import Reviews from "../Reviews/Reviews";
import Photos from "./Photos";
import ProfileTabs from "./ProfileTabs";
import SelfProfileHeader from "./SelfProfileHeader";
import profilePlaceholder from "../../assets/pics/profile-pic-placeholder.jpg";
import { selectProfilePic, selectBanner, fetchUserBanner } from "../../Slices/PhotosSlice";
import { selectProfilePosts, fetchPostsByUserId, appendProfilePosts, setProfilePosts } from "../../Slices/PostsSlice";
import { selectFavorites, fetchFavorites } from "../../Slices/FavoritesSlice";
import Favorites from "./Favorites";
import { selectFollowing, selectFollowers } from "../../Slices/friendsSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import ConnectionsModal from "./ConnectionsModal";
import { clearTodayEngagementLog } from "../../Slices/EngagementSlice";
import useTaggedFeed from "../../hooks/useTaggedFeed";

export default function UserProfile() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const profilePic = useSelector(selectProfilePic);
  const banner = useSelector(selectBanner);
  const profilePosts = useSelector(selectProfilePosts);
  const following = useSelector(selectFollowing) || [];
  const followers = useSelector(selectFollowers) || [];
  const [activeSection, setActiveSection] = useState("reviews");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [connectionsModalVisible, setConnectionsModalVisible] = useState(false);
  const [activeConnectionsTab, setActiveConnectionsTab] = useState("followers");
  const favorites = useSelector(selectFavorites);
  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  const bannerPlaceholder = null;
  const userId = user?.id;

  const { loadMore, refresh, isLoading, hasMore } = usePaginatedFetch({
    fetchThunk: fetchPostsByUserId,
    appendAction: appendProfilePosts,
    resetAction: setProfilePosts,
    params: { userId },
    limit: 5,
  });

  const {
    posts: taggedPosts,
    status: taggedStatus,
    hasMore: taggedHasMore,
    loadMore: loadMoreTagged,
  } = useTaggedFeed(userId, activeSection, 15);

  useEffect(() => {
    if (userId) {
      dispatch(fetchUserBanner(userId));
      dispatch(fetchFavorites(userId));

      const task = InteractionManager.runAfterInteractions(() => {
        refresh();
      });

      return () => task?.cancel?.();
    }
  }, [userId, dispatch, refresh]);

  const photos = useMemo(() => {
    const pickUrl = (m) =>
      m?.url ||
      m?.presignedUrl ||
      m?.photoUrl ||
      m?.src ||
      m?.uri ||
      null;

    const urls = new Set();
    for (const post of profilePosts || []) {
      const mediaArr = Array.isArray(post?.photos) ? post.photos : post?.media;
      if (!Array.isArray(mediaArr)) continue;
      for (const m of mediaArr) {
        const u = pickUrl(m);
        if (u && !urls.has(u)) urls.add(u);
      }
    }
    return Array.from(urls).map((url) => ({ url }));
  }, [profilePosts]);

  const data =
    activeSection === "photos"
      ? photos
      : activeSection === "favorites"
      ? favorites
      : []; // reviews & tagged render in ListHeader

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
        followersCount={followers.length || 0}
        followingCount={following.length || 0}
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
          // ✅ unified post array (mixed types OK)
          reviews={profilePosts}
          onLoadMore={loadMore}
          isLoadingMore={isLoading}
          hasMore={hasMore}
        />
      )}
      {activeSection === "tagged" && (
        <Reviews
          // ✅ unified post array for tagged content
          reviews={taggedPosts}
          onLoadMore={loadMoreTagged}
          isLoadingMore={taggedStatus === "pending"}
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
        keyExtractor={(item, index) => (item?.url ?? String(index))}
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
