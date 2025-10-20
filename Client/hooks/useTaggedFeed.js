import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setTaggedUser,
  refreshTaggedPosts,
  fetchTaggedPosts,
  makeSelectTaggedPosts,
  makeSelectTaggedStatus,
  makeSelectTaggedHasMore,
  makeSelectTaggedCursor,
} from '../Slices/TaggedPostsSlice';

export default function useTaggedFeed(userId, activeSection, pageSize = 15) {
  const dispatch = useDispatch();

  // tell the slice which profile we’re viewing (per-user cache)
  useEffect(() => {
    if (userId) dispatch(setTaggedUser(userId));
  }, [userId, dispatch]);

  // stable selector instances for this user
  const postsSel   = useMemo(() => makeSelectTaggedPosts(userId), [userId]);
  const statusSel  = useMemo(() => makeSelectTaggedStatus(userId), [userId]);
  const hasMoreSel = useMemo(() => makeSelectTaggedHasMore(userId), [userId]);
  const cursorSel  = useMemo(() => makeSelectTaggedCursor(userId), [userId]);

  const posts   = useSelector(postsSel);
  const status  = useSelector(statusSel);
  const hasMore = useSelector(hasMoreSel);
  const cursor  = useSelector(cursorSel);

  // lazy load when “Tagged” tab is opened
  useEffect(() => {
    if (activeSection !== 'tagged' || !userId) return;
    const empty = !Array.isArray(posts) || posts.length === 0;
    const idle  = status === 'idle';
    if (idle && empty) {
      dispatch(refreshTaggedPosts({ userId, limit: pageSize }));
    }
  }, [activeSection, userId, posts, status, pageSize, dispatch]);

  const loadMore = () => {
    if (status === 'pending' || !hasMore) return;
    dispatch(fetchTaggedPosts({ userId, limit: pageSize, after: cursor }));
  };

  return { posts, status, hasMore, loadMore };
}
