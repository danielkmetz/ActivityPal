import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

export default function PostTypeToggle({ postType, setPostType, hideTypes = [] }) {
  const allTypes = [
    { key: 'review', label: 'Review' },
    { key: 'check-in', label: 'Check-in' },
    { key: 'invite', label: 'Invite' },
  ];

  const types = allTypes.filter(t => !hideTypes.includes(t.key));

  const handleSelect = (key) => setPostType?.(key);

  return (
    <View style={styles.wrap}>
      {types.map(({ key, label }) => {
        const isActive = postType === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => handleSelect(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Text style={[styles.tabTxt, isActive && styles.tabTxtActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: 'tomato',
  },
  tabTxt: {
    fontSize: 16,
    color: '#777',
  },
  tabTxtActive: {
    color: 'tomato',
    fontWeight: 'bold',
  },
});
