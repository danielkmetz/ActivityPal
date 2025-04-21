import { useState, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';

export default function usePaginatedFetch({
  fetchThunk,
  appendAction,
  resetAction,
  userId,
  limit,
}) {
  const dispatch = useDispatch();

  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);
  const allKeysRef = useRef(new Set());
  const lastCursorRef = useRef(null); // { sortDate: ..., id: ... }

  const loadPage = useCallback(
    async (isRefresh = false) => {
      console.log(`🔁 loadPage called. isRefresh=${isRefresh}`);
      if (loadingRef.current) {
        console.log('⛔ Aborting: Already loading');
        return;
      }
      if (!hasMore && !isRefresh) {
        console.log('⛔ Aborting: No more pages and not a refresh');
        return;
      }

      loadingRef.current = true;
      setIsLoading(true);

      const after = isRefresh ? null : lastCursorRef.current;
      console.log('📤 Dispatching fetchThunk with:', { userId, limit, after });

      try {
        const fetchArgs = {
          userId,
          limit,
          after: after === undefined ? null : after
        };
        
        if (after !== undefined) {
          fetchArgs.after = after;
        }

        const actionResult = await dispatch(fetchThunk(fetchArgs));
        const payload = actionResult.payload;
        
        if (!Array.isArray(payload)) {
          console.error("❌ Invalid payload returned:", payload);
          throw new Error("Expected an array from thunk but got something else");
        }
        
        console.log("📥 Payload received:", payload.length);

        if (!payload || payload.length === 0) {
          console.log('🛑 No items returned. Ending pagination.');
          setHasMore(false);
          return;
        }

        const newItems = payload.filter((item) => {
          const key = `${item.type}-${item._id}`;
          if (allKeysRef.current.has(key)) return false;
          allKeysRef.current.add(key);
          return true;
        });
        console.log('✨ New unique items:', newItems.length);

        const lastItem = payload[payload.length - 1];
        if (lastItem?.sortDate && lastItem?._id) {
          lastCursorRef.current = {
            sortDate: lastItem.sortDate,
            id: lastItem._id,
          };
          console.log('📌 Updated lastCursorRef:', lastCursorRef.current);
        }

        if (isRefresh) {
          if (newItems.length > 0) {
            dispatch(resetAction(newItems));
            console.log('🔄 Refreshed with new items:', newItems.length);
          } else {
            console.log('⚠️ No new items to refresh.');
          }
          allKeysRef.current = new Set(newItems.map(item => `${item.type}-${item._id}`));
          setHasMore(payload.length >= limit);
        } else {
          if (newItems.length > 0) {
            dispatch(appendAction(newItems));
            console.log('📥 Appended new items:', newItems.length);
          } else {
            console.log('⚠️ No new items to append.');
          }

          if (payload.length < limit || newItems.length === 0) {
            console.log('🚧 No more pages. Setting hasMore to false.');
            setHasMore(false);
          }
        }
      } catch (err) {
        console.error('❌ Error in usePaginatedFetch:', err);
      } finally {
        setIsLoading(false);
        loadingRef.current = false;
        console.log('✅ loadPage complete.');
      }
    },
    [dispatch, fetchThunk, appendAction, resetAction, userId, limit, hasMore]
  );

  const loadMore = useCallback(() => {
    console.log('⬇️ Triggered loadMore');
    if (!loadingRef.current && hasMore) {
      loadPage(false);
    } else {
      console.log('🛑 Skipping loadMore — already loading or no more items');
    }
  }, [loadPage, hasMore]);

  const refresh = useCallback(() => {
    console.log('🔄 Triggered refresh');
    setHasMore(true);
    lastCursorRef.current = null;
    allKeysRef.current = new Set();
    loadPage(true);
  }, [loadPage]);

  return { loadMore, refresh, isLoading, hasMore };
}
