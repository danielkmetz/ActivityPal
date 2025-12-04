import React, { createContext, useContext, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser, selectIsBusiness } from '../Slices/UserSlice';
import { selectCoordinates } from '../Slices/LocationSlice';
import { fetchUserActivity, appendUserAndFriendsPosts, setUserAndFriendsPosts } from '../Slices/PostsSlice';
import { selectUserAndFriendsPosts, selectUserAndFriendsRefreshNonce } from '../Slices/PostsSelectors/postsSelectors';
import usePaginatedFetch from '../utils/usePaginatedFetch';

const UserFeedContext = createContext(null);

export function UserFeedProvider({ children }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const isBusiness = useSelector(selectIsBusiness);
  const coords = useSelector(selectCoordinates);
  const refreshSignal = useSelector(selectUserAndFriendsRefreshNonce);
  const userId = user?.id ?? null;          
  const userLat = coords?.lat ?? null;
  const userLng = coords?.lng ?? null;

  // Only fetch for non-business accounts with a valid user
  const enabled = Boolean(userId && !isBusiness);

  const { loadMore, refresh, isLoading, hasMore } = usePaginatedFetch({
    fetchThunk: fetchUserActivity,                
    appendAction: appendUserAndFriendsPosts,      
    resetAction: setUserAndFriendsPosts,          
    params: { userLat, userLng },                 
    limit: 5,
    refreshSignal,
  });

  const posts = useSelector(selectUserAndFriendsPosts);

  // Kick a refresh when enabled and dependencies change
  const lastKeyRef = useRef({ userId: null, refreshSignal: null });
  useEffect(() => {
    if (!enabled) return;
    const last = lastKeyRef.current;
    if (last.userId !== userId || last.refreshSignal !== refreshSignal) {
      refresh();
      lastKeyRef.current = { userId, refreshSignal };
    }
  }, [enabled, userId, refreshSignal, refresh]);

  // Clear when disabled (logout or switched to business)
  useEffect(() => {
    if (!enabled && lastKeyRef.current.userId !== null) {
      dispatch(setUserAndFriendsPosts([]));
      lastKeyRef.current = { userId: null, refreshSignal: null };
    }
  }, [enabled, dispatch]);

  // Safe wrappers
  const safeRefresh = useCallback(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  const safeLoadMore = useCallback(() => {
    if (enabled && hasMore) loadMore();
  }, [enabled, hasMore, loadMore]);

  const value = useMemo(
    () => ({
      enabled,
      posts: enabled ? posts : [],       // ⬅️ expose unified posts
      loadMore: safeLoadMore,
      refresh: safeRefresh,
      isLoading: enabled ? isLoading : false,
      hasMore: enabled ? hasMore : false,
    }),
    [enabled, posts, safeLoadMore, safeRefresh, isLoading, hasMore]
  );

  return <UserFeedContext.Provider value={value}>{children}</UserFeedContext.Provider>;
}

export function useUserFeed() {
  const ctx = useContext(UserFeedContext);
  if (!ctx) throw new Error('useUserFeed must be used within UserFeedProvider');
  return ctx;
}
