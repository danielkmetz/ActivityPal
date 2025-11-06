import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import {
  setHasFetchedOnce,
  setSuggestedPosts,
  selectSuggestedPosts,
  fetchMyInvites,        
} from "../../Slices/PostsSlice";
import {
  selectSuggestedUsers,
  fetchFollowRequests,
  fetchMutualFriends,
  fetchFollowersAndFollowing,
  selectFriends,
} from "../../Slices/friendsSlice";
import { selectUser } from "../../Slices/UserSlice";
import { fetchFavorites } from "../../Slices/FavoritesSlice";
import { useSelector, useDispatch } from "react-redux";
import Reviews from "../Reviews/Reviews";
import InviteModal from "../ActivityInvites/InviteModal";
import { selectStories, fetchStories } from "../../Slices/StoriesSlice";
import Stories from "../Stories/Stories";
import { closeInviteModal, inviteModalStatus } from "../../Slices/ModalSlice";
import { selectNearbySuggestions } from "../../Slices/GooglePlacesSlice";
import { fetchConversations } from "../../Slices/DirectMessagingSlice";
import ChangeLocationModal from "../Location/ChangeLocationModal";
import { logEngagementIfNeeded } from "../../Slices/EngagementSlice";
import { useUserFeed } from "../../Providers/UserFeedContext";

const Home = ({ scrollY, onScroll, isAtEnd }) => {
  const dispatch = useDispatch();
  const { posts, loadMore, isLoading, hasMore } = useUserFeed();
  const friends = useSelector(selectFriends);
  const user = useSelector(selectUser);
  const suggestedFollows = useSelector(selectSuggestedUsers);
  const nearbySuggestions = useSelector(selectNearbySuggestions);
  const inviteModal = useSelector(inviteModalStatus);
  const stories = useSelector(selectStories);
  const suggestedPosts = useSelector(selectSuggestedPosts);
  const [updatedFeed, setUpdatedFeed] = useState([]);
  const seenToday = useRef(new Set());
  const userId = user?.id;

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 60,
      viewAreaCoveragePercentThreshold: undefined,
    }),
    []
  );

  const handleViewableItemsChanged = useRef(({ viewableItems }) => {
    viewableItems.forEach((item) => {
      const data = item.item;
      const placeId = data?.placeId;

      if (data?.type === "suggestion") {
        let targetId = null;
        let targetType = null;

        const kind = (data.kind || "").toLowerCase();

        if (kind.includes("event")) {
          targetType = "event";
          targetId = data._id;
        } else if (kind.includes("promo")) {
          targetType = "promo";
          targetId = data._id;
        } else {
          targetType = "place";
          targetId = data.placeId;
        }

        const engagementKey = `${targetType}:${targetId}`;

        if (targetId && targetType && !seenToday.current.has(engagementKey)) {
          seenToday.current.add(engagementKey);
          logEngagementIfNeeded(dispatch, {
            targetType,
            targetId,
            placeId,
            engagementType: "view",
          });
        }
      }
    });
  }).current;

  // Bootstrap peripheral data (stories, friends, DMs, invites, etc.)
  useEffect(() => {
    if (!userId) return;

    dispatch(fetchFavorites(userId));
    dispatch(fetchStories(userId));
    dispatch(fetchFollowRequests(userId));
    dispatch(fetchMutualFriends(userId));
    dispatch(fetchFollowersAndFollowing(userId));
    dispatch(fetchConversations());

    // ⬇️ unified invites into the feed from PostsSlice
    dispatch(fetchMyInvites(userId));

    dispatch(setHasFetchedOnce(true));
  }, [userId, dispatch]);

  // Turn suggested follows into unified posts (prefer u.posts; fallback kept)
  function flattenSuggestedFollows(users) {
    const out = [];
    users.forEach((u) => {
      const unified = Array.isArray(u.posts) ? u.posts : [
        ...(u.reviews || []),
        ...(u.checkIns || []),
      ];
      unified.forEach((p) => out.push({ ...p, isSuggestedFollowPost: true }));
    });
    return out;
  }

  useEffect(() => {
    if (suggestedFollows.length > 0) {
      const followPosts = flattenSuggestedFollows(suggestedFollows);
      dispatch(setSuggestedPosts(followPosts));
    } else {
      dispatch(setSuggestedPosts([]));
    }
  }, [suggestedFollows, dispatch]);

  // Interleave nearby suggestion cards into the unified post feed
  function injectSuggestions(base, suggestions, interval = 3) {
    const result = [];
    let count = 0;
    let si = 0;

    for (let i = 0; i < base.length; i++) {
      result.push({ ...base[i], __wrapped: false });
      count++;
      if (count % interval === 0 && si < suggestions.length) {
        const s = suggestions[si++];
        result.push({ ...s, type: s.type ?? "suggestion", __wrapped: true });
      }
    }
    while (si < suggestions.length) {
      const s = suggestions[si++];
      result.push({ ...s, type: s.type ?? "suggestion", __wrapped: true });
    }
    return result;
  }

  useEffect(() => {
    const suggestionCards = nearbySuggestions.map((s) => ({ ...s, type: "suggestion" }));
    const allSuggestions = [...suggestionCards, ...(suggestedPosts || [])];

    // ⬇️ use unified posts from the context provider
    const merged = injectSuggestions(posts, allSuggestions, 3);
    setUpdatedFeed(merged);
  }, [posts, nearbySuggestions, suggestedPosts]);

  const safeLoadMore = useCallback(() => {
    if (!isLoading && hasMore) loadMore();
  }, [isLoading, hasMore, loadMore]);

  return (
    <View style={styles.container}>
      <Reviews
        scrollY={scrollY}
        onScroll={onScroll}
        onLoadMore={safeLoadMore}
        isLoadingMore={isLoading}
        hasMore={hasMore}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        // ⬇️ This prop name stays “reviews” to avoid downstream churn; data are unified posts
        reviews={updatedFeed}
        ListHeaderComponent={
          <View style={styles.storiesWrapper}>
            <Stories stories={stories} />
          </View>
        }
      />
      {isAtEnd && <View style={styles.bottom} />}
      <InviteModal
        visible={inviteModal}
        onClose={() => dispatch(closeInviteModal())}
        friends={friends}
      />
      <ChangeLocationModal />
    </View>
  );
};

export default Home;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5", marginTop: -70 },
  input: { backgroundColor: "#009999", paddingVertical: 10, alignItems: "center" },
  storiesWrapper: { backgroundColor: "#008080", paddingTop: 190 },
  bottom: { marginBottom: 30 },
});
