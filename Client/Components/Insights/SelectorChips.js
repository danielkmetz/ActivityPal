import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';

export default function SelectorChips({
  items = [],
  selectedIds = [],
  setSelectedIds,               // pass setState from parent
  emptyText = 'No items.',
  getId = (it) => it._id ?? it.id,
  getLabel = (it) => it.title ?? it.name ?? 'Untitled',
  containerStyle,
  chipStyle,
  chipActiveStyle,
  chipInactiveStyle,
  chipTextStyle,
  chipTextActiveStyle,
}) {
  if (!items?.length) return <Text style={styles.muted}>{emptyText}</Text>;

  const toggle = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <View style={[styles.row, containerStyle]}>
      {items.map((it) => {
        const id = getId(it);
        const label = getLabel(it);
        const active = selectedIds.includes(id);
        return (
          <Pressable
            key={id}
            onPress={() => toggle(id)}
            style={[
              styles.chip,
              active ? styles.chipActive : styles.chipInactive,
              chipStyle,
              active ? chipActiveStyle : chipInactiveStyle,
            ]}
          >
            <Text
              style={[
                active ? styles.chipTextActive : styles.chipText,
                chipTextStyle,
                active ? chipTextActiveStyle : null,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipInactive: { backgroundColor: '#fff', borderColor: '#bbb' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  muted: { color: '#666', textAlign: 'center', marginVertical: 8 },
});
