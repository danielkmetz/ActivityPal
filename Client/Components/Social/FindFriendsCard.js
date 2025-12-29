import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "./socialStyles";

export default function FindFriendsCard({ onPress }) {
  return (
    <View style={styles.findFriendsCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.findFriendsTitle}>Find Friends</Text>
        <Text style={styles.findFriendsSub}>Connect with contacts or invite friends</Text>
      </View>

      <TouchableOpacity onPress={onPress} style={styles.findFriendsButton}>
        <Text style={styles.findFriendsButtonText}>Discover</Text>
      </TouchableOpacity>
    </View>
  );
}
