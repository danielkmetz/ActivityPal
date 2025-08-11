import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function CommentButton({ count, onPress, orientation }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.iconButton}>
      <View style={[
        styles.iconWrapper,
        orientation === 'row' ? styles.iconRow : styles.iconColumn
      ]}>
        <MaterialCommunityIcons
          name="comment-outline"
          size={orientation === 'column' ? 28 : 20}
          color="#808080"
        />
        <Text style={[
          styles.countText,
          orientation === 'column' && styles.countTextColumn
        ]}>
          {count}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconButton: { alignItems: 'center' },
  iconWrapper: { alignItems: 'center' },
  iconRow: { flexDirection: 'row', alignItems: 'center' },
  iconColumn: { flexDirection: 'column' },
  countText: { fontSize: 14, marginLeft: 5, color: "#555" },
  countTextColumn: { color: "#fff", marginLeft: 0, marginTop: 4 },
});
