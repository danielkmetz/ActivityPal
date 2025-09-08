import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { Entypo } from '@expo/vector-icons';

function StatusBadge({ status, isLiveish, viewerCount = 0, onPress }) {
  if (status === 'connecting') {
    return <Text style={S.badge}>Connecting…</Text>;
  }
  if (status === 'reconnecting') {
    return <Text style={S.badge}>Reconnecting…</Text>;
  }
  if (isLiveish) {
    return (
      <Pressable
        onPress={onPress}
        style={[S.badge, S.badgeLive, S.badgeRow]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Viewers: ${viewerCount - 1}`}
      >
        <Text style={S.badgeLiveTxt}>LIVE</Text>
        <Text style={S.badgeLiveTxt}>·</Text>
        <Entypo name="eye" size={14} color="#7f1d1d" />
        <Text style={S.badgeLiveTxt}>{viewerCount}</Text>
      </Pressable>
    );
  }
  if (status === 'error') {
    return <Text style={[S.badge, S.badgeError]}>Error</Text>;
  }
  return null;
}

const S = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    color: '#991b1b',
    fontWeight: '800',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeLive: {
    backgroundColor: '#fecaca', // red-200
  },
  badgeError: {
    backgroundColor: '#fecaca',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeLiveTxt: {
    color: '#7f1d1d', // red-900
    fontWeight: '800',
  },
});

export default React.memo(StatusBadge);
