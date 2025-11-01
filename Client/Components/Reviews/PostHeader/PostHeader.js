import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native'; // ✅ add Image
import StoryAvatar from '../../Stories/StoryAvatar';
import TaggedUsersLine from './TaggedUsersLine';
import FollowButton from '../PostActions/FollowButton';
import { useSelector } from 'react-redux';           // ✅ useSelector
import { navigateToOtherUserProfile } from '../../../utils/userActions';
import { useNavigation } from '@react-navigation/native';
import { selectUser } from '../../../Slices/UserSlice';            // ✅ get current user id
import dayjs from 'dayjs';

const pinPic = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

export default function PostHeader({
  post,
  includeAtWithBusiness = false,
  showAtWhenNoTags = false,
  containerStyle,
  leftContainerStyle,
}) {
  const navigation = useNavigation();
  const postContent = post?.original ?? post ?? {};
  const currentUserId = useSelector(selectUser)?.id;
  const {
    isSuggestedFollowPost = false,
    profilePicUrl,
    userId,
    photos,
    media: mediaRaw
  } = postContent;
  const postDate = postContent?.date || postContent?.createdAt || postContent?.dateTime;

  // ✅ ensure media is an array
  const media = Array.isArray(photos) ? photos : (Array.isArray(mediaRaw) ? mediaRaw : []);

  const onViewProfile = (targetId) =>
    navigateToOtherUserProfile({
      navigation,
      userId: targetId,
      currentUserId,
    });

  const getTimeSincePosted = (date) => dayjs(date).fromNow(true);

  return (
    <View style={[styles.header, containerStyle]}>
      <View style={[styles.userPicAndName, leftContainerStyle]}>
        <StoryAvatar userId={userId} profilePicUrl={profilePicUrl} />
        <View >
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <TaggedUsersLine
              post={post}
              onPressUser={onViewProfile}
              includeAtWithBusiness={includeAtWithBusiness}
              showAtWhenNoTags={showAtWhenNoTags}
              renderBusinessAccessory={
                post?.type === 'check-in' && media.length > 0
                  ? () => <Image source={{ uri: pinPic }} style={styles.inlinePin} />
                  : null
              }
            />
          </View>
          <Text style={styles.reviewDate}>{getTimeSincePosted(postDate)} ago</Text>
          {isSuggestedFollowPost && <Text style={styles.subText}>Suggested user for you</Text>}
        </View>
      </View>
      <FollowButton
        post={post}
        onPressFollowing={() => onViewProfile(userId)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userPicAndName: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    padding: 6,
    paddingRight: 30,
    flexShrink: 1,
  },
  subText: {
    color: '#555',
    padding: 8,
    marginTop: -10
  },
  inlinePin: {
    width: 14,
    height: 14,
    marginLeft: 4,
    marginBottom: -2,
  },
  reviewDate: { padding: 8, marginTop: -15, color: '#555' },
});
