import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, InteractionManager } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { fetchOtherUserSettings, fetchUserFullName } from "../../Slices/UserSlice";
import { selectOtherUserFollowers, selectOtherUserFollowing, fetchOtherUserFollowersAndFollowing } from "../../Slices/friendsSlice";
import Reviews from "../Reviews/Reviews";
import ConnectionsModal from "./ConnectionsModal";
import { fetchOtherUserBanner, resetOtherUserBanner, fetchOtherUserProfilePic, resetOtherUserProfilePic } from "../../Slices/PhotosSlice";
import { fetchPostsByOtherUserId, resetOtherUserPosts, appendOtherUserPosts, setOtherUserPosts } from "../../Slices/PostsSlice";
import { selectOtherUserPosts } from "../../Slices/PostsSelectors/postsSelectors";
import { fetchOtherUserFavorites, selectOtherUserFavorites, fetchOtherUserFavoritedDetails, selectOtherUserFavoritedDetails } from "../../Slices/FavoritesSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import useTaggedFeed from "../../hooks/useTaggedFeed";
import OtherUserProfileChrome from "./OtherUserProfileChrome";

export default function OtherUserProfile({ route, navigation }) {
  const { userId } = route.params;
  const dispatch = useDispatch();
  const otherUserFollowing = useSelector(selectOtherUserFollowing) || [];
  const otherUserFollowers = useSelector(selectOtherUserFollowers) || [];
  const favorites = useSelector(selectOtherUserFavorites) || [];
  const profileReviews = useSelector(selectOtherUserPosts) || [];
  const favoritedDetails = useSelector(selectOtherUserFavoritedDetails) || [];
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

  useEffect(() => {
    if (activeSection !== "favorites") return;
    if (!Array.isArray(favorites) || favorites.length === 0) return;
    dispatch(fetchOtherUserFavoritedDetails(favorites));
  }, [activeSection, favorites, dispatch]);

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

  const photoRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < photos.length; i += 3) {
      const chunk = photos.slice(i, i + 3);
      rows.push({
        type: "photoRow",
        key: `photoRow:${chunk[0]?.url?.split("?")[0] || i}`,
        row: chunk,
      });
    }
    return rows.length ? rows : [{ type: "empty", key: "empty:photos" }];
  }, [photos]);

  const favoritesRows = useMemo(() => {
    if (activeSection !== "favorites") return [];

    if (!favoritedDetails.length) {
      return [{ type: "empty", key: "favorites:empty", message: "No favorites yet." }];
    }

    return favoritedDetails.map((biz, idx) => ({
      type: "favorite",
      key: `favorite:${biz?._id || biz?.placeId || idx}`,
      favorite: biz,
    }));
  }, [activeSection, favoritedDetails]);

  const listData = useMemo(() => {
    if (activeSection === "favorites") return favoritesRows;
    if (activeSection === "photos") return photoRows;
    if (activeSection === "tagged") return taggedPosts;
    return profileReviews;
  }, [activeSection, favoritesRows, photoRows, taggedPosts, profileReviews]);

  return (
    <>
      <Reviews
        reviews={listData}
        ListHeaderComponent={
          <OtherUserProfileChrome
            userId={userId}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            onOpenFollowers={() => { setActiveConnectionsTab("followers"); setConnectionsModalVisible(true); }}
            onOpenFollowing={() => { setActiveConnectionsTab("following"); setConnectionsModalVisible(true); }}
          />
        }
        onLoadMore={
          activeSection === "tagged" ? loadMoreTagged :
            activeSection === "reviews" || activeSection === "photos" ? loadMore :
              undefined
        }
        hasMore={
          activeSection === "tagged" ? taggedHasMore :
            activeSection === "reviews" || activeSection === "photos" ? hasMore :
              false
        }
        isLoadingMore={
          activeSection === "tagged" ? taggedStatus === "pending" :
            activeSection === "reviews" || activeSection === "photos" ? isLoading :
              false
        }
      />
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
