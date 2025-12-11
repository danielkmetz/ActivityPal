import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import FriendPills from '../FriendPills';

export default function TaggedFriendsPreview({
  taggedUsers = [],
  onOpenTagModal,
  containerStyle,
}) {
  const hasTags = Array.isArray(taggedUsers) && taggedUsers.length > 0;
  if (!hasTags) return null;

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          <AntDesign name="tag" size={14} style={styles.icon} />
          <Text style={styles.label}>Tagged friends</Text>
        </View>
        <TouchableOpacity onPress={onOpenTagModal} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>
      <FriendPills friends={taggedUsers} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
  },
  editText: {
    fontSize: 11,
    color: '#6b7280',
  },
});
