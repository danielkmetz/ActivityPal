import React, { createContext, useContext, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser, selectIsBusiness } from '../Slices/UserSlice';
import { fetchBusinessPosts, appendBusinessPosts, setBusinessPosts } from '../Slices/PostsSlice';
import { selectBusinessPosts } from '../Slices/PostsSelectors/postsSelectors';
import usePaginatedFetch from '../utils/usePaginatedFetch';

const BusinessReviewsContext = createContext(null);

export function BusinessReviewsProvider({ children }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const isBusiness = useSelector(selectIsBusiness);
  const placeId = user?.businessDetails?.placeId ?? null;

  const enabled = Boolean(isBusiness && placeId);

  const { loadMore, refresh, isLoading, hasMore } = usePaginatedFetch({
    fetchThunk: fetchBusinessPosts,
    appendAction: appendBusinessPosts,
    resetAction: setBusinessPosts,
    params: { placeId },
    limit: 5,
  });

  const businessPosts = useSelector(selectBusinessPosts);

  const lastPlaceIdRef = useRef(null);
  useEffect(() => {
    if (!enabled) return;
    if (lastPlaceIdRef.current !== placeId) {
      refresh();
      lastPlaceIdRef.current = placeId;
    }
  }, [enabled, placeId, refresh]);

  useEffect(() => {
    if (!enabled && lastPlaceIdRef.current) {
      dispatch(setBusinessPosts([]));
      lastPlaceIdRef.current = null;
    }
  }, [enabled, dispatch]);

  const safeRefresh = useCallback(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  const safeLoadMore = useCallback(() => {
    if (enabled && hasMore) loadMore();
  }, [enabled, hasMore, loadMore]);

  const value = useMemo(
    () => ({
      enabled,
      // keep prop name 'reviews' for backwards compatibility
      reviews: enabled ? businessPosts : [],
      loadMore: safeLoadMore,
      refresh: safeRefresh,
      isLoading: enabled ? isLoading : false,
      hasMore: enabled ? hasMore : false,
    }),
    [enabled, businessPosts, safeLoadMore, safeRefresh, isLoading, hasMore]
  );

  return (
    <BusinessReviewsContext.Provider value={value}>
      {children}
    </BusinessReviewsContext.Provider>
  );
}

export function useBusinessReviews() {
  const ctx = useContext(BusinessReviewsContext);
  if (!ctx) throw new Error('useBusinessReviews must be used within BusinessReviewsProvider');
  return ctx;
}
