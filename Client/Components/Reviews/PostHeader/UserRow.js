import React, { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Avatar } from "react-native-paper";
import dayjs from "dayjs";
import TaggedUsersLine from "./TaggedUsersLine";
import profilePicPlaceholder from "../../../assets/pics/profile-pic-placeholder.jpg";

const UserRow = memo(function UserRow({
  review,
  totalInvited,
  onBack,
  onPressUser,
}) {
  const postType = review?.type || review?.postType || post?.type;
  const owner = review?.owner || post?.owner;
  const authorPic = owner?.profilePicUrl || review?.profilePicUrl;
  const isShared = postType === "sharedPost" || review?.postType === "sharedPost" || !!review?.original;
  const isInvite = postType === "invite";

  return (
    <View style={styles.userRow}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <MaterialCommunityIcons name="chevron-left" size={26} color="#000" />
      </TouchableOpacity>
      <Avatar.Image
        size={48}
        source={authorPic ? { uri: authorPic } : profilePicPlaceholder}
        style={{ backgroundColor: "#ccc", marginRight: 10 }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <TaggedUsersLine
          post={review}
          onPressUser={onPressUser}
          includeAtWithBusiness={postType === "check-in"}
          showAtWhenNoTags={postType === "check-in"}
          prefix=" is with "
          containerStyle={{ paddingHorizontal: 0, paddingVertical: 0 }}
          nameStyle={{ fontSize: 16, fontWeight: "bold", color: "#222" }}
          connectorStyle={{ fontSize: 15, fontWeight: "bold", color: "#555" }}
        />
        {!!review?.date && (
          <Text style={styles.reviewDate}>
            {dayjs(review.date).fromNow(true)} ago
          </Text>
        )}
        {isShared && <Text style={styles.subNote}>shared a post</Text>}
        {isInvite && (
          <Text style={styles.subNote}>
            invited {totalInvited} friend{totalInvited === 1 ? "" : "s"} to a Vybe
          </Text>
        )}
      </View>
    </View>
  );
});

export default UserRow;

const styles = StyleSheet.create({
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    padding: 5,
    marginRight: 4,
  },
  reviewDate: {
    marginTop: 4,
    color: "#555",
    fontSize: 12,
  },
  subNote: {
    marginTop: 2,
    color: "#555",
    fontSize: 12,
  },
});
