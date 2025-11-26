import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { setHasFetchedOnce, setSuggestedPosts, selectSuggestedPosts, fetchMyInvites } from '../../Slices/PostsSlice';
import { selectSuggestedUsers, fetchFollowRequests, fetchMutualFriends,  fetchFollowersAndFollowing, selectFriends } from '../../Slices/friendsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { fetchFavorites } from '../../Slices/FavoritesSlice';
import Reviews from '../Reviews/Reviews';
import InviteModal from '../ActivityInvites/InviteModal';
import { closeInviteModal, inviteModalStatus } from '../../Slices/ModalSlice';
import { selectNearbySuggestions } from '../../Slices/GooglePlacesSlice';
import { fetchConversations } from '../../Slices/DirectMessagingSlice';
import ChangeLocationModal from '../Location/ChangeLocationModal';
import { useUserFeed } from '../../Providers/UserFeedContext';

const Home = ({ scrollY, onScroll, isAtEnd }) => {
  const dispatch = useDispatch();
  const { posts, loadMore, isLoading, hasMore } = useUserFeed();
  const friends = useSelector(selectFriends);
  const user = useSelector(selectUser);
  const suggestedFollows = useSelector(selectSuggestedUsers);
  const nearbySuggestions = useSelector(selectNearbySuggestions);
  const inviteModal = useSelector(inviteModalStatus);
  const suggestedPosts = useSelector(selectSuggestedPosts);
  const [updatedFeed, setUpdatedFeed] = useState([]);
  const userId = user?.id;

  // Bootstrap peripheral data
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
        reviews={updatedFeed} // unified posts
        ListHeaderComponent={
          <View style={{ paddingTop: 120}} />
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
  container: { flex: 1, backgroundColor: '#f5f5f5', },
  input: {
    backgroundColor: '#009999',
    paddingVertical: 10,
    alignItems: 'center',
  },
  bottom: { marginBottom: 30 },
});
