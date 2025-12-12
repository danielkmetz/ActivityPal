import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, FlatList, StyleSheet, InteractionManager } from "react-native";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { selectUser, fetchOtherUserSettings, selectOtherUserSettings, fetchUserFullName } from "../../Slices/UserSlice";
import { selectFollowRequests, selectFollowing, selectOtherUserFollowers, selectOtherUserFollowing, fetchOtherUserFollowersAndFollowing } from "../../Slices/friendsSlice";
import Reviews from "../Reviews/Reviews";
import Photos from "./Photos";
import Favorites from "./Favorites";
import ConnectionsModal from "./ConnectionsModal";
import { fetchOtherUserBanner, resetOtherUserBanner, fetchOtherUserProfilePic, resetOtherUserProfilePic } from "../../Slices/PhotosSlice";
import { fetchPostsByOtherUserId, resetOtherUserPosts, appendOtherUserPosts, setOtherUserPosts } from "../../Slices/PostsSlice";
import { selectOtherUserPosts } from "../../Slices/PostsSelectors/postsSelectors";
import { fetchOtherUserFavorites, selectOtherUserFavorites } from "../../Slices/FavoritesSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import useTaggedFeed from "../../hooks/useTaggedFeed";
import OtherUserProfileChrome from "./OtherUserProfileChrome";

export default function OtherUserProfile({ route, navigation }) {
  const { userId } = route.params;
  const dispatch = useDispatch();
  const mainUser = useSelector(selectUser, shallowEqual);
  const followRequests = useSelector(selectFollowRequests) || { sent: [], received: [] };
  const following = useSelector(selectFollowing) || [];
  const otherUserFollowing = useSelector(selectOtherUserFollowing) || [];
  const otherUserFollowers = useSelector(selectOtherUserFollowers) || [];
  const otherUserPrivacy = useSelector(selectOtherUserSettings);
  const favorites = useSelector(selectOtherUserFavorites) || [];
  const profileReviews = useSelector(selectOtherUserPosts) || [];
  const isPrivate = otherUserPrivacy?.profileVisibility === "private";
  const [isRequestSent, setIsRequestSent] = useState(false);
  const [isRequestReceived, setIsRequestReceived] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeSection, setActiveSection] = useState("reviews");
  const [connectionsModalVisible, setConnectionsModalVisible] = useState(false);
  const [activeConnectionsTab, setActiveConnectionsTab] = useState("followers");

  const { loadMore, refresh, isLoading, hasMore } = usePaginatedFetch({
    fetchThunk: fetchPostsByOtherUserId,
    appendAction: appendOtherUserPosts,
    resetAction: setOtherUserPosts,
    params: { userId },
    limit: 5,
  });

  const {
    posts: taggedPosts,
    status: taggedStatus,
    hasMore: taggedHasMore,
    loadMore: loadMoreTagged,
  } = useTaggedFeed(userId, activeSection, 15);

  /* ------------------------------ */
  /* Fetch user data                 */
  /* ------------------------------ */
  useEffect(() => {
    if (!userId) return;

    dispatch(fetchOtherUserBanner(userId));
    dispatch(fetchUserFullName(userId));
    dispatch(fetchOtherUserProfilePic(userId));
    dispatch(fetchOtherUserFavorites(userId));
    dispatch(fetchOtherUserSettings(userId));
    dispatch(fetchOtherUserFollowersAndFollowing(userId));

    const task = InteractionManager.runAfterInteractions(() => {
      refresh();
    });

    return () => task?.cancel?.();
  }, [userId, dispatch, refresh]);

  /* ------------------------------ */
  /* Derive relationship state       */
  /* ------------------------------ */
  useEffect(() => {
    if (!userId) return;

    const followingIds = (following || []).map((u) => String(u?._id || u?.id)).filter(Boolean);
    const sentRequestIds = (followRequests?.sent || []).map((u) => String(u?._id || u)).filter(Boolean);
    const receivedRequestIds = (followRequests?.received || []).map((u) => String(u?._id || u)).filter(Boolean);

    setIsRequestSent(sentRequestIds.includes(String(userId)));
    setIsRequestReceived(receivedRequestIds.includes(String(userId)));
    setIsFollowing(followingIds.includes(String(userId)));
  }, [following, followRequests, userId]);

  /* ------------------------------ */
  /* Cleanup on leave                */
  /* ------------------------------ */
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      dispatch(resetOtherUserBanner());
      dispatch(resetOtherUserPosts());
      dispatch(resetOtherUserProfilePic());
    });

    return unsubscribe;
  }, [navigation, dispatch]);

  const photos = useMemo(() => {
    if (activeSection !== "photos") return [];

    const urls = new Set();
    for (const post of profileReviews || []) {
      const mediaArr = Array.isArray(post?.photos) ? post.photos : post?.media;
      if (!Array.isArray(mediaArr)) continue;
      for (const m of mediaArr) {
        const u = m?.url || m?.presignedUrl || m?.uri || null;
        if (u) urls.add(u);
      }
    }
    return Array.from(urls).map((url) => ({ url }));
  }, [activeSection, profileReviews]);

  /* ------------------------------ */
  /* Chrome                          */
  /* ------------------------------ */
  const header = useCallback(() => {
    return (
      <OtherUserProfileChrome
        userId={userId}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onOpenFollowers={() => { setActiveConnectionsTab("followers"); setConnectionsModalVisible(true); }}
        onOpenFollowing={() => { setActiveConnectionsTab("following"); setConnectionsModalVisible(true); }}
      />
    );
  }, [userId, activeSection]);

  /* ------------------------------ */
  /* Tab bodies                       */
  /* ------------------------------ */
  const renderPrivateGate = useCallback(() => {
    // If your backend already returns nothing when private, you can remove this.
    return (
      <FlatList
        style={styles.container}
        data={[{ key: "private" }]}
        keyExtractor={(x) => x.key}
        ListHeaderComponent={header}
        renderItem={() => <View style={{ height: 200 }} />}
        showsVerticalScrollIndicator={false}
      />
    );
  }, [header]);

  const renderReviews = useCallback(() => {
    return (
      <Reviews
        reviews={profileReviews}
        onLoadMore={loadMore}
        isLoadingMore={isLoading}
        hasMore={hasMore}
        ListHeaderComponent={header}
        ListFooterComponent={<View style={{ height: 100 }} />}
      />
    );
  }, [profileReviews, loadMore, isLoading, hasMore, header]);

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

  const isLocked = isPrivate && !isFollowing && !isRequestReceived && String(mainUser?.id) !== String(userId);

  const body = useMemo(() => {
    if (isLocked) return renderPrivateGate();
    if (activeSection === "reviews") return renderReviews();
    if (activeSection === "tagged") return renderTagged();
    if (activeSection === "photos") return renderPhotos();
    if (activeSection === "favorites") return renderFavorites();
    return renderReviews();
  }, [
    isLocked,
    activeSection,
    renderPrivateGate,
    renderReviews,
    renderTagged,
    renderPhotos,
    renderFavorites,
  ]);

  return (
    <>
      {body}
      <ConnectionsModal
        visible={connectionsModalVisible}
        onClose={() => setConnectionsModalVisible(false)}
        followers={otherUserFollowers}
        following={otherUserFollowing}
        initialTab={activeConnectionsTab}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
});
