import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NeedsRecapBadge from '../Invites/NeedsRecapBadge'; 

export default function RecapHeader({
  relatedInviteId,
  business,
  inviteDateTimeLabel,
}) {
  const navigation = useNavigation();

  if (!relatedInviteId) return null;

  const title = business?.name || 'Your plans';
  const subtitle = inviteDateTimeLabel ? ` • ${inviteDateTimeLabel}` : '';

  const handleViewInvite = () => {
    navigation.navigate('InviteDetails', { postId: relatedInviteId });
  };

  return (
    <View style={styles.recapBanner}>
      <View style={styles.recapTextContainer}>
        <Text style={styles.recapLabel}>Recapping</Text>
        <Text style={styles.recapTitle} numberOfLines={1}>
          {title}
          {subtitle}
        </Text>
      </View>
      {/* Reuse RecapBadge as the "View invite" pill */}
      <NeedsRecapBadge
        post={null}              // we’re driving it via onPress, so post is unused here
        label="View invite"
        onPress={handleViewInvite}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  recapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginBottom: 12,
  },
  recapTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  recapLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  recapTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
});
