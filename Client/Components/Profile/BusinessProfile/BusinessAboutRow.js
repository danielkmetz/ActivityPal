import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function BusinessAboutRow({ location, phone, description }) {
  return (
    <View style={styles.aboutContainer}>
      <Text style={styles.aboutLabel}>Address:</Text>
      <Text>{location || ""}</Text>

      <Text style={styles.aboutLabel}>Phone:</Text>
      <Text>{phone || ""}</Text>

      <Text style={styles.aboutLabel}>Description:</Text>
      <Text>{description || ""}</Text>

      <View style={{ height: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  aboutContainer: { padding: 10, width: "100%" },
  aboutLabel: { fontWeight: "bold", marginTop: 10 },
});
