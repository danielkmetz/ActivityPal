import React, { useState, useEffect, useMemo } from "react";
import { View, InteractionManager } from "react-native";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import { fetchUserBanner } from "../../Slices/PhotosSlice";
import { fetchPostsByUserId, appendProfilePosts, setProfilePosts } from "../../Slices/PostsSlice";
import { selectProfilePosts } from "../../Slices/PostsSelectors/postsSelectors";
import { selectFavorites, fetchFavorites, fetchFavoritedDetails, selectFavoritedDetails, selectFavoritesStatus } from "../../Slices/FavoritesSlice";
import { selectFollowing, selectFollowers } from "../../Slices/friendsSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import useTaggedFeed from "../../hooks/useTaggedFeed";
import EditProfileModal from "./EditProfileModal";
import ConnectionsModal from "./ConnectionsModal";
import Reviews from "../Reviews/Reviews";
import ProfileChrome from './ProfileChrome';
import profilePlaceholder from "../../assets/pics/profile-pic-placeholder.jpg";

export default function UserProfile() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser, shallowEqual);
  const userId = user?.id;
  const profilePosts = useSelector(selectProfilePosts) || [];
  const favorites = useSelector(selectFavorites) || [];
  const following = useSelector(selectFollowing) || [];
  const followers = useSelector(selectFollowers) || [];
  const favoritedDetails = useSelector(selectFavoritedDetails) || [];
  const favoritesStatus = useSelector(selectFavoritesStatus);
  const [activeSection, setActiveSection] = useState("reviews");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [connectionsModalVisible, setConnectionsModalVisible] = useState(false);
  const [activeConnectionsTab, setActiveConnectionsTab] = useState("followers");

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

  useEffect(() => {
    if (activeSection !== "favorites") return;
    if (!Array.isArray(favorites) || favorites.length === 0) return;
    dispatch(fetchFavoritedDetails(favorites));
  }, [activeSection, favorites, dispatch]);

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

    if (favoritesStatus === "loading") {
      return [{ type: "loading", key: "favorites:loading" }];
    }
    if (favoritesStatus === "failed") {
      return [{ type: "error", key: "favorites:error", message: "Error fetching favorites." }];
    }

    if (!favoritedDetails.length) {
      return [{ type: "empty", key: "favorites:empty", message: "No favorites yet." }];
    }

    return favoritedDetails.map((biz, idx) => ({
      type: "favorite",
      key: `favorite:${biz?._id || biz?.placeId || idx}`,
      favorite: biz,
    }));
  }, [activeSection, favoritesStatus, favoritedDetails]);

  const listData = useMemo(() => {
    if (activeSection === "favorites") return favoritesRows;
    if (activeSection === "photos") return photoRows;      
    if (activeSection === "tagged") return taggedPosts;
    return profilePosts;
  }, [activeSection, favoritesRows, photoRows, taggedPosts, profilePosts]);

  return (
    <View>
      <Reviews
        reviews={listData}
        ListHeaderComponent={
          <ProfileChrome
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            setEditModalVisible={setEditModalVisible}
            setConnectionsModalVisible={setConnectionsModalVisible}
            setActiveConnectionsTab={setActiveConnectionsTab}
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
    </View>
  );
}