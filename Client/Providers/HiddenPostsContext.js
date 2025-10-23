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
import { removePostFromFeeds } from '../Slices/ReviewsSlice';
import { normalizePostType as normalizeKeyType } from '../utils/normalizePostType';

const HiddenPostsContext = createContext(null);

// ---------- Debug helpers ----------
const TAG = '[HiddenPostsContext]';
const DEBUG = false;               // master switch
const VERBOSE_IS_HIDDEN = false;  // logs every isHidden call (noisy)
const VERBOSE_ANNOTATE = false;   // logs every annotated item (very noisy)

const now = () => new Date().toISOString();
const dbg = (...args) => { if (DEBUG) console.log(TAG, ...args); };
const warn = (...args) => { if (DEBUG) console.warn(TAG, ...args); };
const err = (...args) => { if (DEBUG) console.error(TAG, ...args); };

const hiddenKey = (postType, postId) => `${normalizeKeyType(postType)}:${String(postId)}`;

export function HiddenPostsProvider({ children }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const isBusiness = useSelector(selectIsBusiness);
  const userId = user?.id || null;
  const enabled = Boolean(userId && !isBusiness);
  const map = useSelector(selectHiddenMap) || {};
  const status = useSelector((s) => s.hiddenPosts?.status || 'idle');
  const error = useSelector((s) => s.hiddenPosts?.error || null);

  // Track previous values to log transitions/diffs
  const prevStatusRef = useRef(status);
  const prevMapRef = useRef(map);
  const prevEnabledRef = useRef(enabled);

  // Initial / dependency-based fetch
  useEffect(() => {
    dbg('mount/effect -> enabled?', enabled, { userId, isBusiness, at: now() });
    if (!enabled) {
      dbg('skipping fetchHiddenPostIds(): provider disabled');
      return;
    }
    dbg('dispatch(fetchHiddenPostIds())');
    dispatch(fetchHiddenPostIds());
  }, [enabled, userId, isBusiness, dispatch]);

  // Status transition logging
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      dbg('status change', { from: prevStatusRef.current, to: status, at: now() });
      prevStatusRef.current = status;
    }
  }, [status]);

  // Enabled transition logging
  useEffect(() => {
    if (prevEnabledRef.current !== enabled) {
      dbg('enabled change', { from: prevEnabledRef.current, to: enabled, at: now() });
      prevEnabledRef.current = enabled;
    }
  }, [enabled]);

  // Error logging
  useEffect(() => {
    if (error) err('slice error', { error, at: now() });
  }, [error]);

  // Map updates: size + sample keys
  useEffect(() => {
    if (prevMapRef.current !== map) {
      const keys = Object.keys(map || {});
      const size = keys.length;
      dbg('hiddenMap updated', {
        size,
        sampleKeys: keys.slice(0, 10),
        at: now(),
      });
      prevMapRef.current = map;
    }
  }, [map]);

  const refresh = useCallback(() => {
    if (!enabled) {
      warn('refresh() called while disabled');
      return;
    }
    dbg('refresh -> dispatch(fetchHiddenPostIds())');
    dispatch(fetchHiddenPostIds());
  }, [enabled, dispatch]);

  const isHidden = useCallback(
    (postType, postId) => {
      if (!postType || !postId) {
        warn('isHidden called with missing args', { postType, postId });
      }
      const key = hiddenKey(postType, postId);
      const hit = Boolean(map[key]);
      if (DEBUG && VERBOSE_IS_HIDDEN) {
        dbg('isHidden?', { postType, postId, key, hit });
      }
      return hit;
    },
    [map]
  );

  const hide = useCallback(
    (postType, postId) => {
      if (!enabled) {
        warn('hide() called while disabled', { postType, postId });
        return;
      }
      const key = hiddenKey(postType, postId);
      dbg('HIDE request', { postType, postId, key, at: now() });
      try {
        dispatch(hidePost({ postType, postId }));
        // If your feed keys are composite, confirm this call matches that schema
        dispatch(removePostFromFeeds(postId));
        dbg('hidePost dispatched; removePostFromFeeds dispatched', { key });
      } catch (e) {
        err('hidePost dispatch failed', { e });
      }
    },
    [enabled, dispatch]
  );

  const unhide = useCallback(
    (postType, postId) => {
      if (!enabled) {
        warn('unhide() called while disabled', { postType, postId });
        return;
      }
      const key = hiddenKey(postType, postId);
      dbg('UNHIDE request', { postType, postId, key, at: now() });
      try {
        dispatch(unhidePost({ postType, postId }));
        dbg('unhidePost dispatched', { key });
      } catch (e) {
        err('unhidePost dispatch failed', { e });
      }
    },
    [enabled, dispatch]
  );

  // annotate a list of posts with __hidden
  const withHiddenFlags = useCallback(
    (items) => {
      if (!Array.isArray(items)) return items;
      const t0 = Date.now();
      let hiddenCount = 0;

      const out = items.map((it) => {
        const typ = normalizeKeyType(it?.__typename || it?.type || '');
        const id = String(it?._id || it?.id || '');
        const key = `${typ}:${id}`;
        const flag = Boolean(map[key]);
        if (flag) hiddenCount += 1;
        if (DEBUG && VERBOSE_ANNOTATE) dbg('annotate', { key, flag });
        return { ...it, __hidden: flag };
      });

      const durMs = Date.now() - t0;
      dbg('withHiddenFlags', {
        total: items.length,
        hiddenCount,
        durMs,
      });

      return out;
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
