import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function PostTypeToggle({ postType, setPostType, onLivePress }) {
  const types = [
    { key: 'review', label: 'Review' },
    { key: 'check-in', label: 'Check-in' },
    { key: 'invite', label: 'Invite' },
    { key: 'live', label: 'Live' },
  ];

  const handlePress = (key) => {
    if (key === 'live') {
      onLivePress?.();
      return;
    }
    setPostType?.(key);
  };

  return (
    <View style={styles.toggleContainer}>
      {types.map(({ key, label }) => {
        const isActive = postType === key && key !== 'live'; // Live is never the active postType
        return (
          <TouchableOpacity
            key={key}
            style={[styles.toggleButton, isActive && styles.activeToggleButton, key === 'live' && styles.liveTab]}
            onPress={() => handlePress(key)}
          >
            <Text
              style={[styles.toggleButtonText, isActive && styles.activeToggleButtonText, key === 'live' && styles.liveText]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  toggleButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeToggleButton: {
    borderBottomColor: 'tomato',
  },
  toggleButtonText: {
    fontSize: 16,
    color: '#777',
  },
  activeToggleButtonText: {
    color: 'tomato',
    fontWeight: 'bold',
  },
  liveTab: {
    borderBottomColor: '#e11d48',
  },
  liveText: {
    color: '#e11d48',
    fontWeight: 'bold',
  },
});
