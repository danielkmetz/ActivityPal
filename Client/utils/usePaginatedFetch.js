import { useState, useRef, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';

// Toggle this to enable/disable logging
const DEBUG = false;

function log(...args) {
  if (!DEBUG) return;
  console.log('[usePaginatedFetch]', ...args);
}

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
      log('loadPage called', {
        isRefresh,
        hasMore,
        loading: loadingRef.current,
        params,
        limit,
        after: isRefresh ? null : lastCursorRef.current,
      });

      if (loadingRef.current || (!hasMore && !isRefresh)) return;

      loadingRef.current = true;
      setIsLoading(true);

      const after = isRefresh ? null : lastCursorRef.current;

      try {
        const fetchArgs = { ...params, limit, after };
        log('dispatching thunk with', fetchArgs);

        // unwrap throws on rejectWithValue; easier error handling
        const payload = await dispatch(fetchThunk(fetchArgs)).unwrap();

        log('thunk resolved', {
          type: typeof payload,
          count: Array.isArray(payload) ? payload.length : 'non-array',
        });

        if (!Array.isArray(payload)) {
          throw new Error('Expected an array from thunk but got: ' + typeof payload);
        }

        if (payload.length === 0) {
          setHasMore(false);
          return;
        }

        const newItems = payload.filter((item) => {
          const key = `${item?.type}-${item?._id}`;
          if (allKeysRef.current.has(key)) return false;
          allKeysRef.current.add(key);
          return true;
        });

        // Cursor: prefer a “real” post; fallback to last payload item
        const lastRealItem =
          [...newItems]
            .reverse()
            .find((it) =>
              ['review', 'check-in', 'invite', 'event', 'promotion', 'liveStream', 'sharedPost'].includes(it?.type)
            ) || payload[payload.length - 1];

        if (lastRealItem?.sortDate && lastRealItem?._id) {
          lastCursorRef.current = {
            sortDate: lastRealItem.sortDate,
            id: lastRealItem._id,
          };
          log('updated cursor', lastCursorRef.current);
        } else {
          log('no cursor candidate found');
        }

        if (isRefresh) {
          dispatch(resetAction(newItems));
          allKeysRef.current = new Set(newItems.map((it) => `${it?.type}-${it?._id}`));
          setHasMore(payload.length >= (limit ?? Number.MAX_SAFE_INTEGER));
        } else {
          if (newItems.length > 0) {
            dispatch(appendAction(newItems));
          }
          if (payload.length < (limit ?? Number.MAX_SAFE_INTEGER) || newItems.length === 0) {
            setHasMore(false);
          }
        }
      } catch (err) {
        log('ERROR in loadPage:', err?.message || err);
        setHasMore(false);
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

  const refreshRef = useRef(() => {});
  useEffect(() => {
    refreshRef.current = () => {
      log('refresh invoked → reset state and load first page');
      setHasMore(true);
      lastCursorRef.current = null;
      allKeysRef.current = new Set();
      loadPage(true);
    };
  }, [loadPage]);

  useEffect(() => {
    if (refreshSignal == null) return;
    log('refreshSignal changed → refreshing');
    refreshRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const refresh = useCallback(() => {
    refreshRef.current();
  }, []);

  return { loadMore, refresh, isLoading, hasMore };
}
