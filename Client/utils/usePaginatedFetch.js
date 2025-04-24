import { useState, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';

export default function usePaginatedFetch({
  fetchThunk,
  appendAction,
  resetAction,
  params = {},
  limit,
}) {
  const dispatch = useDispatch();

  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);
  const allKeysRef = useRef(new Set());
  const lastCursorRef = useRef(null);

  const loadPage = useCallback(
    async (isRefresh = false) => {
      if (loadingRef.current || (!hasMore && !isRefresh)) return;

      loadingRef.current = true;
      setIsLoading(true);

      const after = isRefresh ? null : lastCursorRef.current;

      try {
        const fetchArgs = { ...params, limit, after };
        const actionResult = await dispatch(fetchThunk(fetchArgs));
        const payload = actionResult.payload;

        if (!Array.isArray(payload)) {
          throw new Error("Expected an array from thunk but got something else");
        }

        if (!payload || payload.length === 0) {
          setHasMore(false);
          return;
        }

        const newItems = payload.filter((item) => {
          const key = `${item.type}-${item._id}`;
          if (allKeysRef.current.has(key)) return false;
          allKeysRef.current.add(key);
          return true;
        });

        const oldestItem = payload.reduce((latest, item) => {
          return new Date(item.sortDate) < new Date(latest.sortDate) ? item : latest;
        }, payload[0]);

        if (oldestItem?.sortDate && oldestItem?._id) {
          lastCursorRef.current = {
            sortDate: oldestItem.sortDate,
            id: oldestItem._id,
          };
        }

        if (isRefresh) {
          if (newItems.length > 0) {
            dispatch(resetAction(newItems));
          }
          allKeysRef.current = new Set(newItems.map(item => `${item.type}-${item._id}`));
          setHasMore(payload.length >= limit);
        } else {
          if (newItems.length > 0) {
            dispatch(appendAction(newItems));
          }

          if (payload.length < limit || newItems.length === 0) {
            setHasMore(false);
          }
        }
      } catch {
        // Handle error silently or implement custom error handling
      } finally {
        setIsLoading(false);
        loadingRef.current = false;
      }
    },
    [dispatch, fetchThunk, appendAction, resetAction, params, limit, hasMore]
  );

  const loadMore = useCallback(() => {
    if (!loadingRef.current && hasMore) {
      loadPage(false);
    }
  }, [loadPage, hasMore]);

  const refresh = useCallback(() => {
    setHasMore(true);
    lastCursorRef.current = null;
    allKeysRef.current = new Set();
    loadPage(true);
  }, [loadPage]);

  return { loadMore, refresh, isLoading, hasMore };
}
