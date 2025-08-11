import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function ShareButton({ onPress, orientation }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.iconButton}>
      <MaterialCommunityIcons
        name="share-all-outline"
        size={orientation === 'column' ? 28 : 30}
        color="#808080"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconButton: { alignItems: 'center' },
});
