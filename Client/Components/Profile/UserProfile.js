import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, InteractionManager } from "react-native";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import { selectUser } from "../../Slices/UserSlice";
import { selectProfilePic, selectBanner, fetchUserBanner } from "../../Slices/PhotosSlice";
import { fetchPostsByUserId, appendProfilePosts, setProfilePosts } from "../../Slices/PostsSlice";
import { selectProfilePosts } from "../../Slices/PostsSelectors/postsSelectors";
import { selectFavorites, fetchFavorites } from "../../Slices/FavoritesSlice";
import { selectFollowing, selectFollowers } from "../../Slices/friendsSlice";
import { clearTodayEngagementLog } from "../../Slices/EngagementSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import useTaggedFeed from "../../hooks/useTaggedFeed";
import EditProfileModal from "./EditProfileModal";
import ConnectionsModal from "./ConnectionsModal";
import ProfileTabs from "./ProfileTabs";
import SelfProfileHeader from "./SelfProfileHeader";
import Reviews from "../Reviews/Reviews";
import Photos from "./Photos";
import Favorites from "./Favorites";
import ProfileChrome from './ProfileChrome';
import profilePlaceholder from "../../assets/pics/profile-pic-placeholder.jpg";

export default function UserProfile() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser, shallowEqual);
  const userId = user?.id;
  const profilePic = useSelector(selectProfilePic);
  const banner = useSelector(selectBanner);
  const profilePosts = useSelector(selectProfilePosts) || [];
  const favorites = useSelector(selectFavorites) || [];
  const following = useSelector(selectFollowing) || [];
  const followers = useSelector(selectFollowers) || [];
  const [activeSection, setActiveSection] = useState("reviews");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [connectionsModalVisible, setConnectionsModalVisible] = useState(false);
  const [activeConnectionsTab, setActiveConnectionsTab] = useState("followers");
  const fullName = useMemo(() => {
    return `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  }, [user?.firstName, user?.lastName]);

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
    if (!userId) return;
    dispatch(fetchUserBanner(userId));
    dispatch(fetchFavorites(userId));

    const task = InteractionManager.runAfterInteractions(() => {
      refresh();
    });

    return () => task?.cancel?.();
  }, [userId, dispatch, refresh]);

  const photos = useMemo(() => {
    if (activeSection !== "photos") return [];

    const pickUrl = (m) =>
      m?.url || m?.presignedUrl || m?.photoUrl || m?.src || m?.uri || null;

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
  }, [activeSection, profilePosts]);

  const openFollowers = useCallback(() => {
    setActiveConnectionsTab("followers");
    setConnectionsModalVisible(true);
  }, []);

  const openFollowing = useCallback(() => {
    setActiveConnectionsTab("following");
    setConnectionsModalVisible(true);
  }, []);

  const onClearLog = useCallback(() => {
    dispatch(clearTodayEngagementLog());
  }, [dispatch]);

  const header = useCallback(() => (
    <ProfileChrome
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      setEditModalVisible={setEditModalVisible}
      setConnectionsModalVisible={setConnectionsModalVisible}
      setActiveConnectionsTab={setActiveConnectionsTab}
    />
  ), [activeSection]);


  /* ------------------------------ */
  /* Tab rendering                   */
  /* ------------------------------ */
  const renderAboutFallback = useCallback(() => {
    // You don’t currently have an "about" tab; this is just a safe fallback.
    return (
      <FlatList
        style={styles.container}
        data={[{ key: "empty" }]}
        keyExtractor={(x) => x.key}
        ListHeaderComponent={header}
        renderItem={() => <View style={{ height: 80 }} />}
        showsVerticalScrollIndicator={false}
      />
    );
  }, [header]);

  const renderReviews = useCallback(() => {
    return (
      <Reviews
        reviews={profilePosts}
        onLoadMore={loadMore}
        isLoadingMore={isLoading}
        hasMore={hasMore}
        ListHeaderComponent={header}
        ListFooterComponent={<View style={{ height: 100 }} />}
      />
    );
  }, [profilePosts, loadMore, isLoading, hasMore, header]);

  const renderTagged = useCallback(() => {
    return (
      <Reviews
        reviews={taggedPosts}
        onLoadMore={loadMoreTagged}
        isLoadingMore={taggedStatus === "pending"}
        hasMore={taggedHasMore}
        ListHeaderComponent={header}
        ListFooterComponent={<View style={{ height: 100 }} />}
      />
    );
  }, [taggedPosts, loadMoreTagged, taggedStatus, taggedHasMore, header]);

  const renderPhotos = useCallback(() => {
    return (
      <Photos
        photos={photos}
        ListHeaderComponent={header}
        ListFooterComponent={<View style={{ height: 100 }} />}
      />
    );
  }, [photos, header]);

  const renderFavorites = useCallback(() => {
    return (
      <Favorites
        favorites={favorites}
        ListHeaderComponent={header}
        ListFooterComponent={<View style={{ height: 100 }} />}
      />
    );
  }, [favorites, header]);

  const body = useMemo(() => {
    if (activeSection === "reviews") return renderReviews();
    if (activeSection === "tagged") return renderTagged();
    if (activeSection === "photos") return renderPhotos();
    if (activeSection === "favorites") return renderFavorites();
    return renderAboutFallback();
  }, [activeSection, renderReviews, renderTagged, renderPhotos, renderFavorites, renderAboutFallback]);

  return (
    <>
      {body}
      <EditProfileModal
        visible={editModalVisible}
        setEditModalVisible={setEditModalVisible}
        onClose={() => setEditModalVisible(false)}
        bannerPlaceholder={null}
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
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  divider: { width: "100%", height: 1, backgroundColor: "lightgray", marginVertical: 10 },
});
