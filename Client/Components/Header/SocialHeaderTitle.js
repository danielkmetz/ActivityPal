import React, { useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

export default function SocialHeaderTitle() {
  const navigation = useNavigation();
  
  const onPressAdd = useCallback(() => {
    navigation.navigate("CreatePost");
  }, [navigation]);

  const title = useMemo(() => "Social", []);

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={onPressAdd} style={styles.addButton}>
          <Text style={styles.addButtonText}>＋</Text>
        </TouchableOpacity>
      </View>
      
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 6, paddingBottom: 10 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#111" },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e9eefc",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { fontSize: 22, fontWeight: "800", color: "#2f5cff", marginTop: -1 },
  searchWrap: { marginBottom: 10 },
  searchInput: {
    height: 42,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e6e6ef",
    color: "#111",
  },
});
