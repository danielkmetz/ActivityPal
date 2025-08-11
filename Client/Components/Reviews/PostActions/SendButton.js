import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function SendButton({ onPress, orientation }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.iconButton}>
      <Feather
        name="send"
        size={orientation === 'column' ? 24 : 20}
        color="#808080"
        style={styles.sendIcon}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconButton: { alignItems: 'center' },
  sendIcon: { transform: [{ rotate: "15deg" }] },
});
