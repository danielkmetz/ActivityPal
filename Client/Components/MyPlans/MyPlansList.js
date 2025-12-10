import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import MyPlansInviteRow from './MyPlansInviteRow';

export default function MyPlansList({ items, onPressItem }) {
  const data = Array.isArray(items) ? items : [];

  if (!data.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          No plans here. Start something?
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => String(item.postId || item.id)}
      renderItem={({ item }) => (
        <MyPlansInviteRow
          item={item}
          onPress={() => onPressItem && onPressItem(item)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#777',
  },
});
