import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native'; // ✅ add Image
import StoryAvatar from '../../Stories/StoryAvatar';
import TaggedUsersLine from './TaggedUsersLine';
import FollowButton from '../PostActions/FollowButton';
import { useDispatch, useSelector } from 'react-redux';           // ✅ useSelector
import { navigateToOtherUserProfile } from '../../../utils/userActions';
import { logEngagementIfNeeded } from '../../../Slices/EngagementSlice';
import { useNavigation } from '@react-navigation/native';
import { selectUser } from '../../../Slices/UserSlice';            // ✅ get current user id

const pinPic = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

export default function PostHeader({
  post,
  includeAtWithBusiness = false,
  showAtWhenNoTags = false,
  containerStyle,
  leftContainerStyle,
}) {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const postContent = post?.original ?? post ?? {};
  const currentUserId = useSelector(selectUser)?.id;
  const { 
    isSuggestedFollowPost = false,
    fullName: authorName,
    businessName,
    placeId,
    taggedUsers = [],
    profilePicUrl,
    userId,
    photos,
    media: mediaRaw
  } = postContent;

  // ✅ ensure media is an array
  const media = Array.isArray(photos) ? photos : (Array.isArray(mediaRaw) ? mediaRaw : []);

  const onPressBusiness = () => {
    logEngagementIfNeeded(dispatch, {
      targetType: 'place',
      targetId: placeId,
      placeId,
      engagementType: 'click',
    });
    navigation.navigate("BusinessProfile", { business: postContent });
  };

  const onViewProfile = (targetId) =>
    navigateToOtherUserProfile({
      navigation,
      userId: targetId,
      currentUserId,
    });

  // ✅ call this as a function; also fix array length check
  const inlineAccessory = () => {
    if (post?.type === 'check-in' && media.length > 0) {
      return <Image source={{ uri: pinPic }} style={styles.smallPinIcon} />;
    }
    return null;
  };

  return (
    <View style={[styles.header, containerStyle]}>
      <View style={[styles.userPicAndName, leftContainerStyle]}>
        <StoryAvatar userId={userId} profilePicUrl={profilePicUrl} />
        <View style={{ flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <TaggedUsersLine
              authorId={userId}
              authorName={authorName}
              taggedUsers={taggedUsers}
              businessName={businessName}
              onPressUser={onViewProfile}
              onPressBusiness={onPressBusiness}
              includeAtWithBusiness={includeAtWithBusiness}
              showAtWhenNoTags={showAtWhenNoTags}
            />
            {inlineAccessory()}{/* ✅ actually invoke it */}
          </View>
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
    marginTop: 4,
  },
  smallPinIcon: {
    width: 16,
    height: 16,
    marginLeft: 5,
    marginBottom: -5,
    marginTop: 5,
  },
});
