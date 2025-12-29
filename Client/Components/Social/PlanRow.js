import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { styles } from "./socialStyles";

export default function PlanRow({ invite, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress || (() => {})}>
      <View style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>Plan</Text>
        <Text style={styles.rowSub}>Upcoming / Hosting / Going</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}


