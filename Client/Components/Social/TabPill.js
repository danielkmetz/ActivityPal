import React from "react";
import { TouchableOpacity, Text, View } from "react-native";
import { styles } from "./socialStyles";

export default function TabPill({ label, active, onPress, badgeCount = 0 }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tabPill, active ? styles.tabPillActive : styles.tabPillInactive]}
    >
      <Text style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive]}>
        {label}
      </Text>

      {badgeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
