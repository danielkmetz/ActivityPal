import React, { useState } from "react";
import { View, TextInput, FlatList, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import profilePicPlaceholder from "../../assets/pics/profile-pic-placeholder.jpg";

export default function UserSearchList({ users = [], onUserPress }) {
  const [searchText, setSearchText] = useState("");

  const filteredUsers = users.filter(user =>
    `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search users..."
        placeholderTextColor="#888"
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => onUserPress?.(item._id)} style={styles.userRow}>
            <Image
              source={item.profilePicUrl ? { uri: item.profilePicUrl } : profilePicPlaceholder}
              style={styles.avatar}
            />
            <Text style={styles.username}>{item.firstName} {item.lastName}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    backgroundColor: "#f1f1f1",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 10,
    marginTop: 10,
    color: "#000",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderColor: "#ccc",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  username: {
    fontSize: 16,
  },
});
