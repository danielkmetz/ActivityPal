import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const InviteeTabs = ({ selectedTab, onChange, counts = {}, style }) => {
  const tabs = [
    { key: 'invited',   label: 'Pending',  count: counts.invited  || 0 },
    { key: 'going',     label: 'Going',    count: counts.going    || 0 },
    { key: 'declined',  label: 'Declined', count: counts.declined || 0 },
    { key: 'requested', label: 'Requests', count: counts.requested|| 0 },
  ];

  return (
    <View style={[styles.container, style]}>
      {tabs.map(({ key, label, count }) => {
        const active = selectedTab === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            style={[styles.button, active && styles.activeButton]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            testID={`tab-${key}`}
          >
            <Text style={active ? styles.activeText : styles.inactiveText}>
              {label} {count}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default memo(InviteeTabs);

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'center', marginBottom: 10 },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginHorizontal: 3,
    backgroundColor: '#f0f0f0',
  },
  activeButton: { backgroundColor: '#007bff' },
  activeText: { color: '#fff', fontWeight: '600' },
  inactiveText: { color: '#333' },
});
