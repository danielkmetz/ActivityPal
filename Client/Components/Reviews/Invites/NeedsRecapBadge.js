import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function NeedsRecapBadge({ post, label = 'Needs recap', onPress }) {
  const navigation = useNavigation();

  // If there's no post and no custom handler, there's nothing useful to show
  if (!post && !onPress) return null;

  const handlePress = () => {
    // If parent passed a custom handler, use that
    if (typeof onPress === 'function') {
      onPress();
      return;
    }

    // Fallback: the original behavior – from an invite → CreatePost
    if (!post || !post._id) return;

    const initialBusiness =
      post.placeId && post.businessName
        ? {
            place_id: post.placeId,
            name: post.businessName,
            formatted_address: post.businessAddress || post.location || '',
          }
        : null;

    navigation.navigate('CreatePost', {
      postType: 'review',
      relatedInviteId: post._id,
      initialBusiness,
    });
  };

  return (
    <TouchableOpacity
      style={styles.recapBadge}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <Text style={styles.recapBadgeText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  recapBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ff5a5f',
  },
  recapBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
