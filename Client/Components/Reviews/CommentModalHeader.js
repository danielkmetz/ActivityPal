import React, { useRef, useMemo, useCallback, useState } from "react";
import { View, Text, Image, Animated, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import PhotoFeed from "./Photos/PhotoFeed";
import PostActions from "./PostActions/PostActions";
import SharedPostContent from "./SharedPosts/SharedPostContent";
import BusinessLink from "./PostHeader/BusinessLink";
import ReviewMetaRow from "./ReviewItem/ReviewMetaRow";
import UserRow from "./PostHeader/UserRow";
import InviteDetails from "./Invites/InviteDetails";

const pinPic = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

export default function CommentModalHeader({
  review,
  timeLeft,
  formatEventDate,
  photoTapped,
  setPhotoTapped,
  setIsPhotoListActive,
  onShare,
}) {
  const navigation = useNavigation();
  const post = useMemo(() => (review?.original ?? review ?? {}), [review]);
  const postType = review?.type || review?.postType || post?.type;
  const isShared = postType === "sharedPost" || review?.postType === "sharedPost" || !!review?.original;
  const isInvite = postType === "invite";
  const details = post?.details || {};
  const postText = review?.message;
  const dateTime = post?.dateTime || post?.date || review?.details?.dateTime;
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const currentPhoto = post?.photos?.[currentPhotoIndex];

  const totalInvited = useMemo(() => {
    return Array.isArray(details?.recipients) ? details.recipients.length : 0;
  }, [details?.recipients]);

  const isMedia = useMemo(() => {
    return (post?.media?.length > 0) || (post?.photos?.length > 0);
  }, [post?.media, post?.photos]);

  const onPressUser = useCallback(
    (userId) => {
      if (!userId) return;
      navigation.navigate("OtherUserProfile", { userId });
    },
    [navigation]
  );

  const onBack = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <UserRow
          review={review}
          totalInvited={totalInvited}
          onBack={onBack}
          onPressUser={onPressUser}
        />
        {!!postText && <Text style={styles.reviewText}>{postText}</Text>}
        {postType !== "check-in" && postType !== "sharedPost" && (
          <View style={{ marginTop: 10 }}>
            <BusinessLink post={post} />
          </View>
        )}
        {isInvite && (
          <InviteDetails
            dateTime={dateTime}
            formatEventDate={formatEventDate}
            timeLeft={timeLeft}
            note={postText}
          />
        )}
        {postType === "review" && <ReviewMetaRow post={review} />}
        {isShared && (
          <SharedPostContent
            sharedItem={review}
            photoTapped={photoTapped}
            setIsPhotoListActive={setIsPhotoListActive}
          />
        )}
      </View>
      {!isShared && (
        <PhotoFeed
          post={review}
          scrollX={scrollX}
          photoTapped={photoTapped}
          setPhotoTapped={setPhotoTapped}
          onActiveChange={(active) => setIsPhotoListActive?.(active)}
          onIndexChange={setCurrentPhotoIndex}   // ✅ NEW
        />
      )}
      {postType === "check-in" && !isMedia && (
        <Image source={{ uri: pinPic }} style={styles.pinIcon} />
      )}
      <View style={{ justifyContent: "center" }}>
        <PostActions
          post={review}
          photo={currentPhoto}
          isCommentScreen={true}
          onShare={onShare}
          embeddedInShared={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: 45,
    backgroundColor: "#fff",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    justifyContent: "center",
  },
  headerText: {
    padding: 10,
  },
  reviewText: {
    fontSize: 15,
    color: "#333",
    marginTop: 20,
    marginBottom: 5,
  },
  pinIcon: {
    width: 50,
    height: 50,
    alignSelf: "center",
    marginBottom: 30,
  },
});
