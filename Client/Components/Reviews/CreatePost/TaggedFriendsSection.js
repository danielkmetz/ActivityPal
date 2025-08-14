import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AntDesign } from '@expo/vector-icons';

import SectionHeader from '../SectionHeader';
import FriendPills from '../FriendPills';

export default function TaggedFriendsSection({
  taggedUsers = [],
  onOpenTagModal, // () => void
  containerStyle,
}) {
  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.headerRow}>
        <SectionHeader title="Tagged Friends" />
        <TouchableOpacity style={styles.tagBtn} onPress={onOpenTagModal}>
          <AntDesign name="tag" size={18} />
          <Text style={styles.tagBtnText}>Tag</Text>
        </TouchableOpacity>
      </View>
      {taggedUsers?.length > 0 ? (
        <FriendPills friends={taggedUsers} />
      ) : (
        <Text style={styles.subText}>No friends tagged yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f2f2f2',
  },
  tagBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  subText: {
    color: '#888',
    marginBottom: 10,
  },
});
