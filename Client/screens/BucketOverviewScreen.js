import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { labelForBucket, getBucketKeyFromMs } from '../utils/buckets';
import { selectMyInvitesForRow } from '../Slices/PostsSelectors/postsSelectors';

export default function BucketOverviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const allInvites = useSelector(selectMyInvitesForRow);

  // mode:
  // - 'bucket'  -> Tonight / Tomorrow / This weekend
  // - 'myPlans' -> all plans you're hosting / going / invited to
  // - 'all'     -> everything from the rail
  const mode = route.params?.mode || 'bucket';
  const bucketKey = route.params?.bucketKey || 'later';

  // Optional legacy param: items passed directly from the rail
  const rawItemsFromRoute = route.params?.items;

  // ---------------- pick + sort items ----------------

  const items = useMemo(() => {
    // If caller explicitly passed items, use those (keeps your old behavior working)
    if (Array.isArray(rawItemsFromRoute) && rawItemsFromRoute.length > 0) {
      const copy = rawItemsFromRoute.slice();
      copy.sort((a, b) => (a.startTimeMs || 0) - (b.startTimeMs || 0));
      return copy;
    }

    const base = Array.isArray(allInvites) ? allInvites : [];
    if (!base.length) return [];

    const byTime = (arr) =>
      arr
        .slice()
        .sort((a, b) => (a.startTimeMs || 0) - (b.startTimeMs || 0));

    if (mode === 'myPlans') {
      // host OR accepted OR pending
      const mine = base.filter((item) => {
        const status = (item.statusForUser || '').toLowerCase();
        const isHost = !!item.isHost;
        return (
          isHost ||
          status === 'accepted' ||
          status === 'pending'
        );
      });
      return byTime(mine);
    }

    if (mode === 'all') {
      return byTime(base);
    }

    // default: bucket mode
    const inBucket = base.filter((item) => {
      const key = getBucketKeyFromMs(item.startTimeMs);
      return key === bucketKey;
    });
    return byTime(inBucket);
  }, [allInvites, rawItemsFromRoute, mode, bucketKey]);

  // ---------------- header copy ----------------

  let title;
  let subtitle;

  if (mode === 'myPlans') {
    title = 'My plans';
    subtitle = "Everything you're hosting or invited to";
  } else if (mode === 'all') {
    title = 'All plans';
    subtitle = 'Your invites and friends’ plans';
  } else {
    // bucket
    title = labelForBucket(bucketKey);
    subtitle = 'Plans and invites in this time window';
  }

  // ---------------- sections: your vs friends ----------------

  const yourItems = Array.isArray(items)
    ? items.filter(
        (item) =>
          item &&
          (item.type === 'you' || item.type === 'invite')
      )
    : [];

  const friendsItems = Array.isArray(items)
    ? items.filter((item) => item && item.type === 'friends')
    : [];

  const showFriendsSection = mode !== 'myPlans';

  // ---------------- navigation on row tap ----------------

  const handlePressItem = (item) => {
    if (!item) return;
    navigation.navigate('InviteDetails', { postId: item.postId });
  };

  const renderInviteRow = ({ item }) => {
    if (!item) return null;

    const placeText = item.mainLabel || '';
    const timeText = item.timeLabel || '';
    const tag =
      item.type === 'you'
        ? 'YOU'
        : item.type === 'invite'
        ? 'INVITE'
        : 'FRIENDS';

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handlePressItem(item)}
        activeOpacity={0.8}
      >
        <View style={styles.rowImageWrapper}>
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.rowImage}
            />
          ) : (
            <View style={styles.rowImageFallback}>
              <Text style={styles.rowImageFallbackText}>
                {placeText ? placeText[0] : '?'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rowContent}>
          <Text style={styles.rowPlace} numberOfLines={1}>
            {placeText}
          </Text>
          <Text style={styles.rowTime} numberOfLines={1}>
            {timeText}
          </Text>
          <View style={styles.tagPill}>
            <Text style={styles.tagPillText}>{tag}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // showTitle controls whether we render a section label (to avoid redundancy)
  const renderSection = (label, data, showTitle = true) => {
    if (!Array.isArray(data) || data.length === 0) return null;

    return (
      <View style={styles.section}>
        {showTitle && label ? (
          <Text style={styles.sectionTitle}>{label}</Text>
        ) : null}
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderInviteRow}
          scrollEnabled={false}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>

      {/* Your plans list WITHOUT redundant "Your plans & invites" label */}
      {renderSection(null, yourItems, false)}

      {/* Friends’ plans WITH label, unless we’re in myPlans mode */}
      {showFriendsSection && renderSection("Friends’ plans", friendsItems, true)}

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            No plans here yet. Start something?
          </Text>
        </View>
      ) : null}
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
  header: {
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#777',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowImageWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginRight: 10,
  },
  rowImage: {
    width: '100%',
    height: '100%',
  },
  rowImageFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowImageFallbackText: {
    fontSize: 18,
    fontWeight: '700',
  },
  rowContent: {
    flex: 1,
  },
  rowPlace: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowTime: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  tagPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  tagPillText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#777',
  },
});
