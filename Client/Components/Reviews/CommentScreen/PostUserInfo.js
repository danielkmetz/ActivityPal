import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Avatar } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import profilePicPlaceholder from "../../../assets/pics/profile-pic-placeholder.jpg";
import dayjs from 'dayjs';

const smallPin = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

const PostUserInfo = ({ onClose, review }) => {
  const isShared =
    review?.type === 'sharedPost' ||
    review?.postType === 'sharedPost' ||
    !!review?.original;

  const isInvite = !isShared && (review?.type === 'invite' || review?.postType === 'invite');
  const hasTaggedUsers = Array.isArray(review?.taggedUsers) && review.taggedUsers.length > 0;
  const postOwnerName = isInvite && review?.sender?.firstName
    ? `${review?.sender?.firstName} ${review?.sender?.lastName}`
    : review?.fullName || `${review?.user?.firstName} ${review?.user?.lastName}`;
  const totalInvited = review?.recipients?.length || 0;

  const postOwnerPic = isShared
    ? (review?.user?.profilePicUrl || review?.profilePicUrl)
    : isInvite
      ? (review?.sender?.profilePicUrl || review?.profilePicUrl)
      : (review?.profilePicUrl || review?.original?.profilePicUrl);

  const getTimeSincePosted = (date) => dayjs(date).fromNow(true);

  return (
    <View style={styles.userInfo}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color="#000" />
        </TouchableOpacity>
      </View>
      <Avatar.Image
        size={48}
        source={postOwnerPic ? { uri: postOwnerPic } : profilePicPlaceholder}
        style={{ backgroundColor: '#ccc' }}
      />
      <View style={styles.textCol}>
        {/* ✅ one single Text that contains everything; no forced \n */}
        <Text style={styles.line}>
          {isInvite ? (
            <>
              <Text style={styles.fullName}>{postOwnerName}</Text>
              {` invited ${totalInvited} friend${totalInvited === 1 ? '' : 's'} to a Vybe`}
            </>
          ) : (
            <Text style={styles.fullName}>{postOwnerName}</Text>
          )}
          {/* tagged users (inline) */}
          {!isInvite && !isShared && (hasTaggedUsers ? ' is with ' : ' is ')}
          {!isInvite && !isShared && hasTaggedUsers && review.taggedUsers.map((u, i) => (
            <Text key={u?.userId || `tagged-${i}`} style={styles.taggedUser}>
              {u?.fullName}{i !== review.taggedUsers.length - 1 ? ', ' : ''}
            </Text>
          ))}
          {/* check-in (inline) */}
          {review?.type === 'check-in' && (
            <>
              {' at '}
              <Text style={styles.businessName}>{review?.businessName}</Text>
              {!!review?.photos?.length && (
                <Image source={{ uri: smallPin }} style={styles.smallPinIcon} />
              )}
            </>
          )}
          {/* shared post (inline) */}
          {isShared && ' shared a post'}
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
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    zIndex: 1,
  },
  backButton: { padding: 5 },
  textCol: {
    flex: 1,
    minWidth: 0,       // <-- critical on Android so the Text can shrink & wrap
    marginLeft: 10,
  },
  line: {
    fontSize: 16,
  },
  fullName: { fontWeight: 'bold', color: '#222' },
  taggedUser: { fontWeight: 'bold', color: '#444' },
  businessName: { fontSize: 16, fontWeight: 'bold', color: '#555' },
  smallPinIcon: { width: 16, height: 16, marginLeft: 6 },

  reviewDate: { marginTop: 5, color: '#555' },
});

export default PostUserInfo;