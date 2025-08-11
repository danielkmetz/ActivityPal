import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';

/**
 * Per-series toggle chips
 *
 * Props:
 * - series:           array like [{ name: 'Views', ... }, ...]
 * - activeMap:        { [seriesName]: boolean }
 * - onToggle:         (name: string) => void
 * - getLabel?:        (s) => string   // optional label mapper (e.g., nameFor)
 * - containerStyle?, chipStyle?, chipActiveStyle?, chipInactiveStyle?,
 *   chipTextStyle?, chipTextActiveStyle?  // optional style overrides
 */
export default function SeriesVisibilityChips({
  series = [],
  activeMap = {},
  onToggle,
  getLabel = (s) => s.name,
  containerStyle,
  chipStyle,
  chipActiveStyle,
  chipInactiveStyle,
  chipTextStyle,
  chipTextActiveStyle,
}) {
  if (!series?.length) return null;

  return (
    <View style={[styles.row, containerStyle]}>
      {series.map((s) => {
        const name = s.name;
        const label = getLabel(s);
        const active = !!activeMap[name];

        return (
          <Pressable
            key={name}
            onPress={() => onToggle?.(name)}
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
});
