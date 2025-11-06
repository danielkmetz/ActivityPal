import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectUser, selectIsBusiness } from '../Slices/UserSlice';
import {
  fetchHiddenPostIds,
  hidePost,
  unhidePost,
  selectHiddenMap,
} from '../Slices/HiddenPostsSlice';
import { removePostFromFeeds } from '../Slices/PostsSlice';

const HiddenPostsContext = createContext(null);

// ---- optional debug switches ----
const TAG = '[HiddenPostsContext]';
const DEBUG = false;
const dbg = (...a) => { if (DEBUG) console.log(TAG, ...a); };
const warn = (...a) => { if (DEBUG) console.warn(TAG, ...a); };
const err  = (...a) => { if (DEBUG) console.error(TAG, ...a); };

export function HiddenPostsProvider({ children }) {
  const dispatch   = useDispatch();
  const user       = useSelector(selectUser);
  const isBusiness = useSelector(selectIsBusiness);
  const userId     = user?.id || null;

  const enabled = Boolean(userId && !isBusiness);

  // Map should now be { [postId: string]: true }
  const map    = useSelector(selectHiddenMap) || {};
  const status = useSelector((s) => s.hiddenPosts?.status || 'idle');
  const error  = useSelector((s) => s.hiddenPosts?.error || null);

  const lastEnabledRef = useRef(enabled);

  // Initial fetch (and re-fetch when enabling toggles on)
  useEffect(() => {
    if (!enabled) {
      dbg('disabled; skipping fetchHiddenPostIds()');
      return;
    }
    if (!lastEnabledRef.current) dbg('enabled -> fetching hidden ids');
    lastEnabledRef.current = true;
    dispatch(fetchHiddenPostIds());
  }, [enabled, dispatch]);

  useEffect(() => {
    if (error) err('HiddenPosts slice error:', error);
  }, [error]);

  const refresh = useCallback(() => {
    if (!enabled) {
      warn('refresh() called while disabled');
      return;
    }
    dispatch(fetchHiddenPostIds());
  }, [enabled, dispatch]);

  // id-only check
  const isHidden = useCallback(
    (_postType, postId) => {
      const id = String(postId ?? '');
      if (!id) {
        warn('isHidden called with empty postId');
        return false;
      }
      return Boolean(map[id]);
    },
    [map]
  );

  const hide = useCallback(
    (_postType, postId) => {
      if (!enabled) {
        warn('hide() called while disabled', { postId });
        return;
      }
      const id = String(postId ?? '');
      if (!id) return;

      try {
        // Thunk should accept id-only now; if your API still allows postType, passing it is harmless
        dispatch(hidePost({ postId: id }));
        // Optimistic: remove from visible feeds immediately
        dispatch(removePostFromFeeds(id));
      } catch (e) {
        err('hidePost dispatch failed', e);
      }
    },
    [enabled, dispatch]
  );

  const unhide = useCallback(
    (_postType, postId) => {
      if (!enabled) {
        warn('unhide() called while disabled', { postId });
        return;
      }
      const id = String(postId ?? '');
      if (!id) return;

      try {
        dispatch(unhidePost({ postId: id }));
      } catch (e) {
        err('unhidePost dispatch failed', e);
      }
    },
    [enabled, dispatch]
  );

  // annotate a list with __hidden using id-only
  const withHiddenFlags = useCallback(
    (items) => {
      if (!Array.isArray(items)) return items;
      return items.map((it) => {
        const id = String(it?._id || it?.id || '');
        const flag = id ? Boolean(map[id]) : false;
        return { ...it, __hidden: flag };
      });
    },
    [map]
  );

  const value = useMemo(
    () => ({
      enabled,
      status,
      error,
      isHidden,
      hide,
      unhide,
      refresh,
      withHiddenFlags,
      hiddenMap: map,
    }),
    [enabled, status, error, isHidden, hide, unhide, refresh, withHiddenFlags, map]
  );

  return <HiddenPostsContext.Provider value={value}>{children}</HiddenPostsContext.Provider>;
}

export function useHiddenPosts() {
  const ctx = useContext(HiddenPostsContext);
  if (!ctx) throw new Error('useHiddenPosts must be used within HiddenPostsProvider');
  return ctx;
}
