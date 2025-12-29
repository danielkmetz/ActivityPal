import React, { useMemo } from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { styles } from "./socialStyles";

export default function PersonRow({ user, onPress, subtitle }) {
  const name = useMemo(() => {
    const first = user?.firstName || "";
    const last = user?.lastName || "";
    const full = `${first} ${last}`.trim();
    return full || "Friend";
  }, [user?.firstName, user?.lastName]);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress || (() => {})}>
      <View style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{name}</Text>
        <Text style={styles.rowSub}>{subtitle || "Tap to view profile"}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}
