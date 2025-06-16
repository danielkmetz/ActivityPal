import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

export default function FriendPills({ friends = [], onRemove }) {
  return (
    <View style={styles.container}>
      {friends.map((user, index) => (
        <View key={user.userId || user._id || index} style={styles.pill}>
          <Image
            source={
              user.presignedProfileUrl || user.profilePicUrl
                ? { uri: user.profilePicUrl || user.presignedProfileUrl }
                : profilePicPlaceholder
            }
            style={styles.profilePic}
          />
          <Text style={styles.pillText}>
            {user.username || user.fullName || user.firstName || "Unknown"}
          </Text>
          {onRemove && (
            <TouchableOpacity onPress={() => onRemove(user)} style={styles.removeButton}>
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 15,
    paddingVertical: 4,
    paddingHorizontal: 8,
    margin: 4,
  },
  pillText: {
    fontSize: 14,
    marginLeft: 5,
    color: '#333',
  },
  profilePic: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  removeButton: {
    marginLeft: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  removeText: {
    fontSize: 16,
    color: '#999',
  },
});
