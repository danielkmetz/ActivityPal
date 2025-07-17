import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { selectUser } from "../../Slices/UserSlice";
import { useSelector } from "react-redux";

export default function PostActions({ 
  item, 
  onShare, 
  handleLikeWithAnimation, 
  handleOpenComments, 
  toggleTaggedUsers, 
  photo, 
  isCommentScreen = false 
}) {
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const currentUserId = user?.id;
  const hasLiked = item?.likes?.some(like => like.userId === currentUserId);

  const handleSend = () => {
    // Determine postType from kind if present
    const kind = item?.kind?.toLowerCase();
    const derivedType =
      kind?.includes('event') ? 'event' :
        kind?.includes('promo') ? 'promotion' : item?.type;

    navigation.navigate('SearchFollowing', {
      postId: item._id,
      postType: derivedType,
      placeId: item.placeId || item.business?.placeId || null,
    });
  };

  return (
    <View style={styles.actionsContainer}>
      <View style={styles.actionButtons}>
        <TouchableOpacity
          onPress={() => handleLikeWithAnimation(item, true)}
          style={styles.likeButton}
        >
          <MaterialCommunityIcons
            name={hasLiked ? "thumb-up" : "thumb-up-outline"} // 👈 Conditional icon
            size={20}
            color={hasLiked ? "#00BFA6" : "#808080"} // 👈 Conditional color
          />
          <Text style={styles.likeCount}>{item?.likes?.length || 0}</Text>
        </TouchableOpacity>
        {!isCommentScreen && (
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
        )}
        <TouchableOpacity
          onPress={() => onShare(item)}
          style={[styles.shareButton, isCommentScreen && { marginLeft: -2 }]}
        >
          <MaterialCommunityIcons name="share-all-outline" size={30} color="#808080" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSend}
          style={[styles.sendButton, isCommentScreen && { marginLeft: -2 }]}
        >
          <Feather name="send" size={20} color="#808080" />
        </TouchableOpacity>
      </View>
      {item?.type !== 'invite' &&
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
    alignItems: 'center',
  },
  actionButtons: {
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
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
    bottom: 40,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 6,
    borderRadius: 20,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
    transform: [{ rotate: '15deg' }],
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
  },
});
