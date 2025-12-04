import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { setHasFetchedOnce, setSuggestedPosts, fetchMyInvites } from '../../Slices/PostsSlice';
import { selectSuggestedPosts, selectMyInvitesForRow } from '../../Slices/PostsSelectors/postsSelectors';
import {
  selectSuggestedUsers,
  fetchFollowRequests,
  fetchMutualFriends,
  fetchFollowersAndFollowing,
  selectFriends,
} from '../../Slices/friendsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { fetchFavorites } from '../../Slices/FavoritesSlice';
import Reviews from '../Reviews/Reviews';
import InviteModal from '../ActivityInvites/InviteModal';
import { closeInviteModal, inviteModalStatus } from '../../Slices/ModalSlice';
import { selectNearbySuggestions } from '../../Slices/GooglePlacesSlice';
import { fetchConversations } from '../../Slices/DirectMessagingSlice';
import ChangeLocationModal from '../Location/ChangeLocationModal';
import { useUserFeed } from '../../Providers/UserFeedContext';
import WhatsHappeningStrip from './WhatsHappeningStrip/WhatsHappeningStrip';
import { useNavigation } from '@react-navigation/native';
import { medium as hapticMedium } from '../../utils/Haptics/haptics';
import { getBucketKeyFromMs } from '../../utils/buckets';
import { selectProfilePic } from '../../Slices/PhotosSlice';

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
  const [updatedFeed, setUpdatedFeed] = useState([]);
  const userId = user?.id;
  const profilePicUrl = profilePic?.url;
  
  const orderedRowItems = useMemo(() => {
    const base = Array.isArray(myInvites) ? myInvites : [];
    if (!base.length) return [];

    const BUCKET_ORDER = {
      tonight: 0,
      tomorrow: 1,
      weekend: 2,
      later: 3,
    };

    const getBucketRank = (item) => {
      const key = getBucketKeyFromMs(item.startTimeMs);
      const rank = BUCKET_ORDER[key];
      return typeof rank === 'number' ? rank : 99;
    };

    const sortByBucketThenTime = (a, b) => {
      const ab = getBucketRank(a);
      const bb = getBucketRank(b);
      if (ab !== bb) return ab - bb;

      const at = a.startTimeMs || 0;
      const bt = b.startTimeMs || 0;
      return at - bt;
    };

    const myPlans = [];
    const otherPlans = [];

    for (const item of base) {
      if (!item) continue;
      const status = (item.statusForUser || '').toLowerCase();
      const isHost = !!item.isHost;

      // "My Plans" = anything you're involved in:
      // hosting OR going/accepted OR invited/pending
      const isMine =
        isHost ||
        status === 'accepted' ||
        status === 'pending';

      if (isMine) {
        myPlans.push(item);
      }

      // "Other" bubbles:
      // - pending invites (so they get their own circle)
      // - friends’ public plans you're not in (no status + not host)
      const isPending = status === 'pending';
      const isFriendOnly = !status && !isHost;

      if (isPending || isFriendOnly) {
        otherPlans.push(item);
      }
    }

    myPlans.sort(sortByBucketThenTime);
    otherPlans.sort(sortByBucketThenTime);

    const bubbles = [];

    if (myPlans.length > 0) {
      const count = myPlans.length;
      const badge = count > 9 ? '9+' : String(count);

      bubbles.push({
        id: 'my-plans',                       // special id
        type: 'you-aggregate',                // synthetic type
        timeLabel: 'My plans',
        mainLabel: 'Tonight & upcoming',
        imageUrl: profilePicUrl || null,
        badge,
        myPlanIds: myPlans.map(p => p.postId), // pass to overview if you want
      });
    }

    // Then all other plans (pending invites + friends’ public plans)
    for (const item of otherPlans) {
      bubbles.push(item);
    }

    return bubbles;
  }, [myInvites, user]);

  const inviteIdsInRail = useMemo(() => {
    const set = new Set();
    const arr = Array.isArray(orderedRowItems) ? orderedRowItems : [];
    arr.forEach((item) => {
      if (!item) return;
      if (!item.postId) return;        // My Plans bubble has no postId, so it’s ignored
      set.add(String(item.postId));
    });
    return set;
  }, [orderedRowItems]);


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
    const out = [];
    users.forEach((u) => {
      const unified = Array.isArray(u.posts)
        ? u.posts
        : [...(u.reviews || []), ...(u.checkIns || [])];
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

  /* --------------------------- inject nearby + suggested --------------------------- */

  function injectSuggestions(base, suggestions, interval = 3) {
    const result = [];
    let count = 0;
    let si = 0;

    for (let i = 0; i < base.length; i++) {
      result.push({ ...base[i], __wrapped: false });
      count++;
      if (count % interval === 0 && si < suggestions.length) {
        const s = suggestions[si++];
        result.push({ ...s, type: s.type ?? 'suggestion', __wrapped: true });
      }
    }
    while (si < suggestions.length) {
      const s = suggestions[si++];
      result.push({ ...s, type: s.type ?? 'suggestion', __wrapped: true });
    }
    return result;
  }

  useEffect(() => {
    const suggestionCards = nearbySuggestions.map((s) => ({
      ...s,
      type: 'suggestion',
    }));
    const allSuggestions = [...suggestionCards, ...(suggestedPosts || [])];

    const merged = injectSuggestions(posts, allSuggestions, 3);

    // How far down do we protect from rail-duplicate invites?
    const MAX_TOP_NON_RAIL_INVITES = 2;

    const isInvite = (post) => {
      const t =
        (post?.type ||
          post?.postType ||
          post?.canonicalType ||
          post?.kind ||
          '') + '';
      const normalized = t.trim().toLowerCase();
      return normalized === 'invite';
    };

    const top = [];
    const rest = [];

    for (const post of merged) {
      const pid = post?._id || post?.id;
      const railInvite =
        pid && isInvite(post) && inviteIdsInRail.has(String(pid));

      // While we still have room in the "top" zone,
      // only allow items that are NOT invites already shown in the rail.
      if (top.length < MAX_TOP_NON_RAIL_INVITES && !railInvite) {
        top.push(post);
      } else {
        rest.push(post);
      }
    }

    setUpdatedFeed([...top, ...rest]);
  }, [posts, nearbySuggestions, suggestedPosts, inviteIdsInRail]);

  /* ------------------------------ pagination handler ------------------------------ */

  const safeLoadMore = useCallback(() => {
    if (!isLoading && hasMore) loadMore();
  }, [isLoading, hasMore, loadMore]);

  /* ------------------------ WhatsHappeningStrip handlers ------------------------ */

  // 1 bubble = 1 plan → go straight to InviteDetails hero screen
  const handlePressItem = useCallback(
    (item) => {
      if (!item) return;
      if (hapticMedium) hapticMedium();

      // First bubble: My Plans aggregate
      if (item.id === 'my-plans') {
        navigation.navigate('BucketOverview', {
          mode: 'myPlans',
          planIds: Array.isArray(item.myPlanIds) ? item.myPlanIds : [],
        });
        return;
      }

      // Everything else in the rail = a single invite
      navigation.navigate('InviteDetails', {
        postId: item.postId,   // InviteDetails screen can use this to select from store
      });
    },
    [navigation]
  );

  const handlePressSeeAll = useCallback(() => {
    navigation.navigate('PlansOverview'); // your grouped "all plans" screen
  }, [navigation]);

  const handlePressCreatePlan = useCallback(() => {
    if (hapticMedium) hapticMedium();
    navigation.navigate('CreatePost', { postType: 'invite' });
  }, [navigation]);

  const listHeader = useMemo(
    () => (
      <View style={styles.headerContainer}>
        {/* spacer so feed content doesn't sit under your animated header */}
        <View style={styles.topSpacer} />
        <WhatsHappeningStrip
          items={orderedRowItems}
          onPressItem={handlePressItem}
          onPressCreatePlan={handlePressCreatePlan}
          onPressSeeAll={handlePressSeeAll}
          onSeenFriendsItems={(ids) => {
            // optional: mark those friend invites as “seen in strip” so you can
            // hide/de-prioritize them in the main feed.
          }}
        />
      </View>
    ),
    [orderedRowItems, handlePressItem, handlePressCreatePlan, handlePressSeeAll]
  );

  return (
    <View style={styles.container}>
      <Reviews
        scrollY={scrollY}
        onScroll={onScroll}
        onLoadMore={safeLoadMore}
        isLoadingMore={isLoading}
        hasMore={hasMore}
        reviews={updatedFeed} // unified posts
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerContainer: {
    paddingHorizontal: 0,
    paddingBottom: 8,
  },
  topSpacer: {
    height: 120, // adjust based on your animated header
  },
  bottom: { marginBottom: 30 },
});
