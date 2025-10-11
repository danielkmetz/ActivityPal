import React, { createContext, useContext, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser, selectIsBusiness } from '../Slices/UserSlice';
import {
  fetchReviewsByPlaceId,
  appendBusinessReviews,
  setBusinessReviews,
  selectBusinessReviews,
} from '../Slices/ReviewsSlice';
import usePaginatedFetch from '../utils/usePaginatedFetch';

const BusinessReviewsContext = createContext(null);

export function BusinessReviewsProvider({ children }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const isBusiness = useSelector(selectIsBusiness);
  const placeId = user?.businessDetails?.placeId ?? null;

  // 👇 Hard guard: only consider fetching when both true
  const enabled = Boolean(isBusiness && placeId);

  const { loadMore, refresh, isLoading, hasMore } = usePaginatedFetch({
    fetchThunk: fetchReviewsByPlaceId,
    appendAction: appendBusinessReviews,
    resetAction: setBusinessReviews,
    params: { placeId }, // fine to pass; we gate actual calls with `enabled`
    limit: 5,
  });

  const reviews = useSelector(selectBusinessReviews);

  // Track last placeId to refresh only on change, and only when enabled
  const lastPlaceIdRef = useRef(null);
  useEffect(() => {
    if (!enabled) return;
    if (lastPlaceIdRef.current !== placeId) {
      refresh(); // will never run unless enabled === true
      lastPlaceIdRef.current = placeId;
    }
  }, [enabled, placeId, refresh]);

  // Optional: clear stale business reviews when user stops being a business
  useEffect(() => {
    if (!enabled && lastPlaceIdRef.current) {
      dispatch(setBusinessReviews([]));
      lastPlaceIdRef.current = null;
    }
  }, [enabled, dispatch]);

  // Safe no-op wrappers so consumers can call without checking
  const safeRefresh = useCallback(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  const safeLoadMore = useCallback(() => {
    if (enabled && hasMore) loadMore();
  }, [enabled, hasMore, loadMore]);

  const value = useMemo(
    () => ({
      enabled,
      reviews: enabled ? reviews : [],
      loadMore: safeLoadMore,
      refresh: safeRefresh,
      isLoading: enabled ? isLoading : false,
      hasMore: enabled ? hasMore : false,
    }),
    [enabled, reviews, safeLoadMore, safeRefresh, isLoading, hasMore]
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
