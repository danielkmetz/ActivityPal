import React from "react";
import { View, Text } from "react-native";
import { styles } from "./socialStyles";

export default function RequestRow({ item, kind }) {
  return (
    <View style={styles.row}>
      <View style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>
          {kind === "follow" ? "Follow request" : "Invite request"}
        </Text>
        <Text style={styles.rowSub}>Wire buttons later</Text>
      </View>
    </View>
  );
}
