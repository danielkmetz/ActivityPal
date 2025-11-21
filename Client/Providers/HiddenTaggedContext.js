import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
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

// Match the slice behavior: strip any "type:" prefix and return just the id
const idOnly = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const parts = s.split(':');
  return parts.length > 1 ? parts[1] : parts[0];
};

export function HiddenTaggedProvider({ children }) {
  const dispatch = useDispatch();

  // auth + “enabled” gate (only normal users)
  const user = useSelector(selectUser);
  const isBusiness = useSelector(selectIsBusiness);
  const userId = user?.id || null;
  const enabled = Boolean(userId && !isBusiness);

  // slice state
  const map = useSelector(selectHiddenTaggedIdsMap);         // { [postId]: true }
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
    // keep signature (postType, postId) for backwards compatibility, but only use the id
    (_postType, postId) => {
      const id = idOnly(postId);
      return Boolean(id && map[id]);
    },
    [map]
  );

  const hide = useCallback(
    (postType, postId) => {
      if (!enabled) return;
      // thunk only needs postId; extra field is harmless but we can skip it
      dispatch(hideTaggedPost({ postType, postId: idOnly(postId) }));
    },
    [enabled, dispatch]
  );

  const unhide = useCallback(
    (postType, postId) => {
      if (!enabled) return;
      dispatch(unhideTaggedPost({ postType, postId: idOnly(postId) }));
    },
    [enabled, dispatch]
  );

  // annotate a list of posts with __hidden = true/false
  const withHiddenFlags = useCallback(
    (items) =>
      Array.isArray(items)
        ? items.map((it) => {
            const id = idOnly(it?._id || it?.id);
            return {
              ...it,
              __hidden: Boolean(id && map[id]),
            };
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
      hiddenMap: map, // keys are postId strings
    }),
    [enabled, status, error, isHidden, hide, unhide, refresh, withHiddenFlags, map]
  );

  return (
    <HiddenTaggedContext.Provider value={value}>
      {children}
    </HiddenTaggedContext.Provider>
  );
}

export function useHiddenTagged() {
  const ctx = useContext(HiddenTaggedContext);
  if (!ctx) throw new Error('useHiddenTagged must be used within HiddenTaggedProvider');
  return ctx;
}
