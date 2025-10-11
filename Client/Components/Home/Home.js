import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import {
  setHasFetchedOnce,
  setSuggestedPosts,
  selectSuggestedPosts,
} from "../../Slices/ReviewsSlice";
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
import { fetchInvites } from "../../Slices/InvitesSlice";
import { fetchConversations } from "../../Slices/DirectMessagingSlice";
import ChangeLocationModal from "../Location/ChangeLocationModal";
import { logEngagementIfNeeded } from "../../Slices/EngagementSlice";
import { useUserFeed } from "../../Providers/UserFeedContext";

const Home = ({ scrollY, onScroll, isAtEnd }) => {
  const dispatch = useDispatch();
  // 🔄 Feed from provider (pagination centralized)
  const { reviews, loadMore, isLoading, hasMore /* , refresh, enabled */ } = useUserFeed();
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

  const viewabilityConfig = { itemVisiblePercentThreshold: 60 };

  const handleViewableItemsChanged = useRef(({ viewableItems }) => {
    viewableItems.forEach((item) => {
      const data = item.item;
      const placeId = data?.placeId;

      if (data?.type === "suggestion") {
        let targetId = null;
        let targetType = null;

        const kind = data.kind?.toLowerCase() || "";

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

  // Keep bootstrapping for peripheral data
  useEffect(() => {
    if (userId) {
      // If you really want to force a refresh here, uncomment and ensure it's from the hook:
      // refresh();
      dispatch(fetchFavorites(userId));
      dispatch(fetchStories(userId));
      dispatch(fetchFollowRequests(userId));
      dispatch(fetchMutualFriends(userId));
      dispatch(fetchFollowersAndFollowing(userId));
      dispatch(fetchInvites(userId));
      dispatch(fetchConversations());
      dispatch(setHasFetchedOnce(true));
    }
  }, [userId, dispatch]);

  function injectSuggestions(base, suggestions, interval = 3) {
    const result = [];
    let reviewCount = 0;
    let suggestionIndex = 0;

    for (let i = 0; i < base.length; i++) {
      result.push({ ...base[i], __wrapped: false });
      reviewCount++;

      if (reviewCount % interval === 0 && suggestionIndex < suggestions.length) {
        const suggestion = suggestions[suggestionIndex];
        result.push({
          ...suggestion,
          type: suggestion.type ?? "suggestion",
          __wrapped: true,
        });
        suggestionIndex++;
      }
    }

    while (suggestionIndex < suggestions.length) {
      const suggestion = suggestions[suggestionIndex];
      result.push({
        ...suggestion,
        type: suggestion.type ?? "suggestion",
        __wrapped: true,
      });
      suggestionIndex++;
    }

    return result;
  }

  function flattenSuggestedFollows(users) {
    const posts = [];
    users.forEach((u) => {
      (u.reviews || []).forEach((r) => posts.push({ ...r, isSuggestedFollowPost: true }));
      (u.checkIns || []).forEach((c) => posts.push({ ...c, isSuggestedFollowPost: true }));
    });
    return posts;
  }

  useEffect(() => {
    if (suggestedFollows.length > 0) {
      const followPosts = flattenSuggestedFollows(suggestedFollows);
      dispatch(setSuggestedPosts(followPosts));
    }
  }, [suggestedFollows, dispatch]);

  useEffect(() => {
    const suggestionCards = nearbySuggestions.map((s) => ({ ...s, type: "suggestion" }));
    const allSuggestions = [...suggestionCards, ...suggestedPosts];
    // ⬇️ Use reviews from the provider, not Redux
    const merged = injectSuggestions(reviews, allSuggestions, 3);
    setUpdatedFeed(merged);
  }, [reviews, nearbySuggestions, suggestedPosts]);

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
