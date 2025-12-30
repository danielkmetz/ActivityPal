import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { selectMyInvites } from '../Slices/InvitesSlice';
import { selectUser } from '../Slices/UserSlice';
import MyPlansFilterRow from '../Components/MyPlans/MyPlansFilterRow';
import MyPlansList from '../Components/MyPlans/MyPlansList';
import { markInvitesOpenedFromRail } from '../Slices/PostsSlice';
import { toId } from '../utils/Formatting/toId';

export default function MyPlansScreen() {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const allInvites = useSelector(selectMyInvites);
  const currentUser = useSelector(selectUser);
  const currentUserId = currentUser?.id;

  const [filter, setFilter] = useState('upcoming'); // 'upcoming' | 'all' | 'past'

  const items = useMemo(() => {
    const base = Array.isArray(allInvites) ? allInvites : [];
    if (!base.length) return [];

    const mapPostToRow = (post) => {
      if (!post) return null;

      const details = post.details || {};
      const rawDate =
        details.dateTime || post.sortDate || post.createdAt || null;

      const startTimeMs = rawDate ? new Date(rawDate).getTime() : null;

      const placeText =
        post.businessName ||
        post.message ||
        'Invite';

      const timeText = rawDate
        ? new Date(rawDate).toLocaleString()
        : '';

      const imageUrl =
        post.businessLogoUrl ||
        (Array.isArray(post.media) && post.media[0]?.url) ||
        null;

      const ownerId =
        post.owner?.id ||
        post.owner?._id ||
        null;

      const isHost = !!currentUserId && ownerId === currentUserId;

      let statusForUser = null;

      if (isHost) {
        statusForUser = 'host';
      } else if (details.recipients && Array.isArray(details.recipients)) {
        const rec = details.recipients.find((r) => {
          const recId =
            r.userId ||
            r.user?.id ||
            r.user?._id ||
            null;
          return recId && recId === currentUserId;
        });
        if (rec?.status) {
          statusForUser = String(rec.status).toLowerCase();
        }
      } else if (details.requests && Array.isArray(details.requests)) {
        const req = details.requests.find((r) => {
          const reqId =
            r.userId ||
            r.user?.id ||
            r.user?._id ||
            null;
          return reqId && reqId === currentUserId;
        });
        if (req?.status) {
          statusForUser = String(req.status).toLowerCase();
        }
      }

      return {
        ...post,
        id: post._id,
        postId: post._id,
        startTimeMs: Number.isFinite(startTimeMs) ? startTimeMs : null,
        mainLabel: placeText,
        timeLabel: timeText,
        imageUrl,
        isHost,
        statusForUser,
      };
    };

    const enriched = base.map(mapPostToRow).filter(Boolean);

    const mine = enriched.filter((item) => {
      const status = (item.statusForUser || '').toLowerCase();
      const isHost = !!item.isHost;

      return (
        isHost ||
        status === 'accepted' ||
        status === 'pending' ||
        status === 'invited'
      );
    });

    return mine
      .slice()
      .sort(
        (a, b) => (a.startTimeMs || 0) - (b.startTimeMs || 0)
      );
  }, [allInvites, currentUserId]);

  const filteredItems = useMemo(() => {
    if (!Array.isArray(items) || !items.length) return [];

    const now = Date.now();

    return items.filter((item) => {
      const hasTime = Number.isFinite(item.startTimeMs);
      const t = hasTime ? item.startTimeMs : 0;

      if (!hasTime) {
        return filter === 'all';
      }

      if (filter === 'all') return true;
      if (filter === 'upcoming') return t >= now;
      if (filter === 'past') return t < now;

      return true;
    });
  }, [items, filter]);

  const handlePressItem = useCallback(
    (item) => {
      const id = toId(item?.postId || item?._id || item?.id);
      if (!id) return;

      dispatch(markInvitesOpenedFromRail([id]));

      navigation.navigate('InviteDetails', { postId: id });
    },
    [dispatch, navigation]
  );

  return (
    <View style={styles.container}>
      <MyPlansFilterRow value={filter} onChange={setFilter} />
      <MyPlansList items={filteredItems} onPressItem={handlePressItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#fff',
    marginTop: 120,
  },
});
