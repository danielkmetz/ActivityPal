import { useState, useRef, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';

export default function usePaginatedFetch({
  fetchThunk,
  appendAction,
  resetAction,
  params = {},
  limit,
  refreshSignal,
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

        const lastRealItem = [...newItems].reverse().find(item =>
          ['review', 'check-in', 'invite'].includes(item.type)
        );

        if (lastRealItem?.sortDate && lastRealItem?._id) {
          lastCursorRef.current = {
            sortDate: lastRealItem.sortDate,
            id: lastRealItem._id,
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

  const refreshRef = useRef(() => { });
  useEffect(() => {
    refreshRef.current = () => {
      setHasMore(true);
      lastCursorRef.current = null;
      allKeysRef.current = new Set();
      loadPage(true);
    };
  }, [loadPage]);

  // 👉 Only depend on refreshSignal here (not on `refresh`)
  useEffect(() => {
    if (refreshSignal == null) return;
    refreshRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const refresh = useCallback(() => {
    // expose a stable public refresh too
    refreshRef.current();
  }, []);

  return { loadMore, refresh, isLoading, hasMore };
}
