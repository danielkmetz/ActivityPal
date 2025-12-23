import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { setHasFetchedOnce, setSuggestedPosts, fetchMyInvites, markInvitesOpenedFromRail } from "../../Slices/PostsSlice";
import { selectSuggestedPosts, selectMyInvitesForRow, selectRailOpenedInviteMap } from "../../Slices/PostsSelectors/postsSelectors";
import { selectSuggestedUsers, fetchFollowRequests, fetchMutualFriends, fetchFollowersAndFollowing, selectFriends } from "../../Slices/friendsSlice";
import { selectUser } from "../../Slices/UserSlice";
import { fetchFavorites } from "../../Slices/FavoritesSlice";
import Reviews from "../Reviews/Reviews";
import InviteModal from "../ActivityInvites/InviteModal";
import { closeInviteModal, inviteModalStatus } from "../../Slices/ModalSlice";
import { selectNearbySuggestions } from "../../Slices/GooglePlacesSlice";
import { fetchConversations } from "../../Slices/DirectMessagingSlice";
import ChangeLocationModal from "../Location/ChangeLocationModal";
import { useUserFeed } from "../../Providers/UserFeedContext";
import WhatsHappeningStrip from "./WhatsHappeningStrip/WhatsHappeningStrip";
import { useNavigation } from "@react-navigation/native";
import { medium as hapticMedium } from "../../utils/Haptics/haptics";
import { getBucketKeyFromMs } from "../../utils/buckets";
import { selectProfilePic } from "../../Slices/PhotosSlice";

const Home = ({ scrollY, onScroll, isAtEnd }) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const { posts, loadMore, isLoading, hasMore } = useUserFeed();
  const friends = useSelector(selectFriends);
  const user = useSelector(selectUser);
  const suggestedFollows = useSelector(selectSuggestedUsers);
  const nearbySuggestions = useSelector(selectNearbySuggestions);
  const inviteModal = useSelector(inviteModalStatus);
  const suggestedPosts = useSelector(selectSuggestedPosts);
  const myInvites = useSelector(selectMyInvitesForRow);
  const profilePic = useSelector(selectProfilePic);
  const railOpenedMap = useSelector(selectRailOpenedInviteMap);
  const [updatedFeed, setUpdatedFeed] = useState([]);
  const userId = user?.id;
  const profilePicUrl = profilePic?.url;

  /* ------------------------ build rail items + my plans ------------------------ */

  const { orderedRowItems, myPlansMeta } = useMemo(() => {
    const base = Array.isArray(myInvites) ? myInvites : [];
    if (!base.length) {
      return { orderedRowItems: [], myPlansMeta: null };
    }

    const BUCKET_ORDER = {
      tonight: 0,
      tomorrow: 1,
      weekend: 2,
      later: 3,
    };

    const getBucketRank = (item) => {
      const key = getBucketKeyFromMs(item?.startTimeMs);
      const rank = BUCKET_ORDER[key];
      return typeof rank === "number" ? rank : 99;
    };

    const sortByBucketThenTime = (a, b) => {
      const ab = getBucketRank(a);
      const bb = getBucketRank(b);
      if (ab !== bb) return ab - bb;

      const at = a?.startTimeMs || 0;
      const bt = b?.startTimeMs || 0;
      return at - bt;
    };

    const myPlans = [];
    const otherPlans = [];

    for (const item of base) {
      if (!item) continue;

      const status = String(item.statusForUser || "").toLowerCase();
      const isHost = !!item.isHost;

      // "My Plans" = anything you're involved in:
      const isMine = isHost || status === "accepted" || status === "pending";
      if (isMine) myPlans.push(item);

      // "Other" bubbles:
      const isPending = status === "pending";
      const isFriendOnly = !status && !isHost;
      if (isPending || isFriendOnly) otherPlans.push(item);
    }

    myPlans.sort(sortByBucketThenTime);
    otherPlans.sort(sortByBucketThenTime);

    let meta = null;
    if (myPlans.length > 0) {
      const count = myPlans.length;
      meta = {
        badge: count > 9 ? "9+" : String(count),
        myPlanIds: myPlans.map((p) => p?.postId).filter(Boolean),
        imageUrl: profilePicUrl || null,
      };
    }

    return { orderedRowItems: otherPlans, myPlansMeta: meta };
  }, [myInvites, profilePicUrl]);

  const inviteIdsInRail = useMemo(() => {
    const set = new Set();
    const arr = Array.isArray(orderedRowItems) ? orderedRowItems : [];
    arr.forEach((item) => {
      const id = item?.postId;
      if (id) set.add(String(id));
    });
    return set;
  }, [orderedRowItems]);

  /* ------------------------ rail-opened (intent) hide set ------------------------ */

  const railOpenedSet = useMemo(() => {
    const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
    const now = Date.now();
    const set = new Set();

    Object.entries(railOpenedMap || {}).forEach(([id, ts]) => {
      if (!id) return;
      if (typeof ts !== "number") return;
      if (now - ts < TTL_MS) set.add(String(id));
    });

    return set;
  }, [railOpenedMap]);

  /* ------------------------ bootstrap peripheral data ------------------------ */

  useEffect(() => {
    if (!userId) return;
    dispatch(fetchFavorites(userId));
    dispatch(fetchFollowRequests(userId));
    dispatch(fetchMutualFriends(userId));
    dispatch(fetchFollowersAndFollowing(userId));
    dispatch(fetchConversations());
    dispatch(fetchMyInvites(userId));
    dispatch(setHasFetchedOnce(true));
  }, [userId, dispatch]);

  /* --------------------------- suggested follows → posts --------------------------- */

  function flattenSuggestedFollows(users) {
    const list = Array.isArray(users) ? users : [];
    const out = [];
    list.forEach((u) => {
      const unified = Array.isArray(u?.posts)
        ? u.posts
        : [...(u?.reviews || []), ...(u?.checkIns || [])];
      unified.forEach((p) => out.push({ ...p, isSuggestedFollowPost: true }));
    });
    return out;
  }

  useEffect(() => {
    const list = Array.isArray(suggestedFollows) ? suggestedFollows : [];
    if (list.length > 0) {
      const followPosts = flattenSuggestedFollows(list);
      dispatch(setSuggestedPosts(followPosts));
    } else {
      dispatch(setSuggestedPosts([]));
    }
  }, [suggestedFollows, dispatch]);

  /* --------------------------- inject nearby + suggested --------------------------- */

  function injectSuggestions(base, suggestions, interval = 3) {
    const b = Array.isArray(base) ? base : [];
    const s = Array.isArray(suggestions) ? suggestions : [];

    const result = [];
    let count = 0;
    let si = 0;

    for (let i = 0; i < b.length; i++) {
      result.push({ ...b[i], __wrapped: false });
      count++;
      if (count % interval === 0 && si < s.length) {
        const next = s[si++];
        result.push({ ...next, type: next?.type ?? "suggestion", __wrapped: true });
      }
    }
    while (si < s.length) {
      const next = s[si++];
      result.push({ ...next, type: next?.type ?? "suggestion", __wrapped: true });
    }
    return result;
  }

  useEffect(() => {
    const suggestionCards = (Array.isArray(nearbySuggestions) ? nearbySuggestions : []).map((x) => ({
      ...x,
      type: "suggestion",
    }));
    const allSuggestions = [...suggestionCards, ...((Array.isArray(suggestedPosts) ? suggestedPosts : []))];

    const merged = injectSuggestions(posts, allSuggestions, 3);

    const MAX_TOP_NON_RAIL_INVITES = 2;

    const isInvite = (post) => {
      const t =
        (post?.type || post?.postType || post?.canonicalType || post?.kind || "") + "";
      return t.trim().toLowerCase() === "invite";
    };

    const shouldHideBecauseOpenedInRail = (post) => {
      if (!post) return false;
      if (!isInvite(post)) return false;

      const pid = post?._id || post?.id;
      if (!pid) return false;

      const id = String(pid);
      if (!railOpenedSet.has(id)) return false;

      // Don’t hide invites that still need action
      const status = String(post?.statusForUser || "").toLowerCase();
      if (status === "pending") return false;

      // Optional: don’t hide your own hosted invites
      if (post?.isHost) return false;

      return true;
    };

    // Filter rail-opened invites (intent-based) BEFORE doing top-zone logic
    const filtered = [];
    for (const post of merged) {
      if (shouldHideBecauseOpenedInRail(post)) continue;
      filtered.push(post);
    }

    const top = [];
    const rest = [];

    for (const post of filtered) {
      const pid = post?._id || post?.id;
      const railInvite = pid && isInvite(post) && inviteIdsInRail.has(String(pid));

      if (top.length < MAX_TOP_NON_RAIL_INVITES && !railInvite) {
        top.push(post);
      } else {
        rest.push(post);
      }
    }

    setUpdatedFeed([...top, ...rest]);
  }, [posts, nearbySuggestions, suggestedPosts, inviteIdsInRail, railOpenedSet]);

  /* ------------------------------ pagination handler ------------------------------ */

  const safeLoadMore = useCallback(() => {
    if (!isLoading && hasMore) loadMore();
  }, [isLoading, hasMore, loadMore]);

  /* ------------------------ WhatsHappeningStrip handlers ------------------------ */

  const handlePressItem = useCallback(
    (item) => {
      if (!item) return;
      if (hapticMedium) hapticMedium();

      const id = item?.postId;
      if (id) dispatch(markInvitesOpenedFromRail([id]));

      navigation.navigate("InviteDetails", { postId: id });
    },
    [navigation, dispatch]
  );

  const handlePressCreatePlan = useCallback(() => {
    if (hapticMedium) hapticMedium();
    navigation.navigate("CreatePost", { postType: "invite" });
  }, [navigation]);

  const listHeader = useMemo(
    () => (
      <View style={styles.headerContainer}>
        <View style={styles.topSpacer} />
        <WhatsHappeningStrip
          items={orderedRowItems}
          myPlansMeta={myPlansMeta}
          onPressItem={handlePressItem}
          onPressCreatePlan={handlePressCreatePlan}
          onSeenFriendsItems={(ids) => {
            // optional: use this to de-prioritize (NOT hide) friend invites later
          }}
        />
      </View>
    ),
    [orderedRowItems, myPlansMeta, handlePressItem, handlePressCreatePlan]
  );

  return (
    <View style={styles.container}>
      <Reviews
        scrollY={scrollY}
        onScroll={onScroll}
        onLoadMore={safeLoadMore}
        isLoadingMore={isLoading}
        hasMore={hasMore}
        reviews={updatedFeed}
        ListHeaderComponent={listHeader}
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
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  headerContainer: {
    paddingHorizontal: 0,
    paddingBottom: 8,
  },
  topSpacer: { height: 120 },
  bottom: { marginBottom: 30 },
});
