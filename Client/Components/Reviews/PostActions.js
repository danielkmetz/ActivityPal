import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function PostActions({ item, handleLike, handleOpenComments, toggleTaggedUsers, photo }) {

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

      {item.type !== 'invite' &&
        photo?.taggedUsers?.length > 0 && (
          <TouchableWithoutFeedback onPress={() => toggleTaggedUsers(photo.photoKey)}>
            <View style={styles.tagIcon}>
              <MaterialCommunityIcons name="tag" size={24} color="white" />
            </View>
          </TouchableWithoutFeedback>
        )}
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
  tagIcon: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 6,
    borderRadius: 20,
  }

});
