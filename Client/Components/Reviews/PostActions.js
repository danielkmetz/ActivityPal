import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function PostActions({ item, handleLike, handleOpenComments }) {
  return (
    <View style={styles.actionsContainer}>
      <TouchableOpacity
        onPress={() => handleLike(item.type, item._id)}
        style={styles.likeButton}
      >
        <MaterialCommunityIcons
          name="thumb-up-outline"
          size={20}
          color="#808080"
        />
        <Text style={styles.likeCount}>{item?.likes?.length || 0}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => handleOpenComments(item)}
        style={styles.commentButton}
      >
        <MaterialCommunityIcons
          name="comment-outline"
          size={20}
          color="#808080"
        />
        <Text style={styles.commentCount}>{item?.comments?.length || 0}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: "row",
    padding: 15,
  },
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  likeCount: {
    fontSize: 14,
    color: "#555",
    marginLeft: 5,
  },
  commentButton: {
    flexDirection: "row",
  },
  commentCount: {
    marginLeft: 5,
  },
});
