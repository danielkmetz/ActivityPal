import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';

export default function ViewerOptionsTrigger({
  post,
  onPress,
  style,
  hitSlop,
  embeddedInShared = false,
}) {
  const user = useSelector(selectUser);
  const currentUserId = user?.id;
  const postOwner = post?.owner?.id || post?.owner?._id || post?.owner?.userId;
  const isOwner = currentUserId === postOwner;

  if (isOwner || embeddedInShared) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={hitSlop || { top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.trigger, style]}
      accessibilityRole="button"
      accessibilityLabel="More options"
    >
      <Text style={styles.dots}>⋯</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  trigger: { position: 'absolute', top: 6, right: 6, padding: 6, zIndex: 5 },
  dots: { fontSize: 22, lineHeight: 22 },
});
