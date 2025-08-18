import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Avatar } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import profilePicPlaceholder from "../../../assets/pics/profile-pic-placeholder.jpg";

const PostUserInfo = ({
  onClose,
  isInvite,
  hasTaggedUsers,
  postOwnerPic,
  postOwnerName,
  totalInvited,
  review,
  sharedPost,
  getTimeSincePosted,
}) => {
  return (
    <View style={styles.userInfo}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color="#000" />
        </TouchableOpacity>
      </View>
      <Avatar.Image
        size={48}
        rounded
        source={postOwnerPic ? { uri: postOwnerPic } : profilePicPlaceholder}
        icon={!postOwnerPic ? { name: 'person', type: 'material', color: '#fff' } : null}
        containerStyle={{ backgroundColor: '#ccc' }}
      />
      <View style={{ flexDirection: 'column', flexShrink: 1 }}>
        <Text style={styles.reviewerName}>
          {isInvite ? (
            <Text style={styles.fullName}>
              {postOwnerName} invited {totalInvited} friend
              {totalInvited.length === 1 ? '' : 's'} to a Vybe
            </Text>
          ) : (
            <Text style={styles.fullName}>{postOwnerName}</Text>
          )}
          {!isInvite && !sharedPost && hasTaggedUsers ? " is with " : !isInvite && !sharedPost ? " is " : null}
          {Array.isArray(review?.taggedUsers) && review?.taggedUsers?.map((user, index) => (
            <Text key={user?.userId || `tagged-${index}`} style={styles.taggedUser}>
              {user?.fullName}
              {index !== review?.taggedUsers.length - 1 ? ", " : ""}
            </Text>
          ))}
          {review?.type === "check-in" && (
            <Text>
              {" "}at{hasTaggedUsers ? <Text>{'\n'}</Text> : <Text>{" "}</Text>}
              <Text style={styles.businessName}>{review?.businessName}</Text>
              {review?.photos?.length > 0 && (
                <Image
                  source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }}
                  style={styles.smallPinIcon}
                />
              )}
            </Text>
          )}
          {sharedPost && (
            <Text> shared a post</Text>
          )}
        </Text>
        <Text style={styles.reviewDate}>{getTimeSincePosted(review?.date)} ago</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    zIndex: 1,
  },
  backButton: {
    padding: 5,
  },
  reviewerName: {
    flexWrap: 'wrap',
    flexShrink: 1,
    fontSize: 16,
    marginLeft: 10,
  },
  fullName: {
    fontWeight: 'bold',
    color: '#222',
  },
  taggedUser: {
    fontWeight: 'bold',
    color: '#444',
  },
  businessName: {
    fontSize: 16,
    fontWeight: "bold",
    color: '#555',
  },
  smallPinIcon: {
    width: 20,
    height: 20,
    marginLeft: 10,
    marginTop: 10,
  },
  reviewDate: {
    marginLeft: 10,
    marginTop: 5,
  },
});

export default PostUserInfo;
