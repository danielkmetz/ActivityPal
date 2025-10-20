import React, { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectUser, selectIsBusiness } from '../Slices/UserSlice';
import {
  fetchHiddenTaggedIds,
  hideTaggedPost,
  unhideTaggedPost,
  selectHiddenTaggedIdsMap,
  selectHiddenTaggedIdsStatus,
  selectHiddenTaggedIdsError,
} from '../Slices/TaggedPostsSlice';

const HiddenTaggedContext = createContext(null);

export function HiddenTaggedProvider({ children }) {
  const dispatch = useDispatch();

  // auth + “enabled” gate (only normal users)
  const user = useSelector(selectUser);
  const isBusiness = useSelector(selectIsBusiness);
  const userId = user?.id || null;
  const enabled = Boolean(userId && !isBusiness);

  // slice state
  const map = useSelector(selectHiddenTaggedIdsMap);         // { "review:123": true, ... }
  const status = useSelector(selectHiddenTaggedIdsStatus);   // 'idle' | 'loading' | 'succeeded' | 'failed'
  const error = useSelector(selectHiddenTaggedIdsError);     // string | null

  // fetch on mount / when enabled toggles
  useEffect(() => {
    if (!enabled) return;
    dispatch(fetchHiddenTaggedIds());
  }, [enabled, userId, dispatch]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    dispatch(fetchHiddenTaggedIds());
  }, [enabled, dispatch]);

  // helpers
  const isHidden = useCallback(
    (postType, postId) => Boolean(map[`${String(postType).toLowerCase()}:${String(postId)}`]),
    [map]
  );

  const hide = useCallback(
    (postType, postId) => {
      if (!enabled) return;
      dispatch(hideTaggedPost({ postType, postId }));
    },
    [enabled, dispatch]
  );

  const unhide = useCallback(
    (postType, postId) => {
      if (!enabled) return;
      dispatch(unhideTaggedPost({ postType, postId }));
    },
    [enabled, dispatch]
  );

  // optional: annotate a list of posts with __hidden (pure helper)
  const withHiddenFlags = useCallback(
    (items) =>
      Array.isArray(items)
        ? items.map((it) => {
            const typ = (it?.__typename || it?.type || '').toLowerCase();
            const id = String(it?._id || it?.id || '');
            return { ...it, __hidden: Boolean(map[`${typ}:${id}`]) };
          })
        : items,
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
      hiddenMap: map, // expose raw map if needed
    }),
    [enabled, status, error, isHidden, hide, unhide, refresh, withHiddenFlags, map]
  );

  return <HiddenTaggedContext.Provider value={value}>{children}</HiddenTaggedContext.Provider>;
}

export function useHiddenTagged() {
  const ctx = useContext(HiddenTaggedContext);
  if (!ctx) throw new Error('useHiddenTagged must be used within HiddenTaggedProvider');
  return ctx;
}
