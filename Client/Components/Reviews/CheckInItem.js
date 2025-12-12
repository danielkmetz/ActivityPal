import React, { useState, useRef, useMemo, Fragment } from "react";
import { View, Text, Image, Animated, StyleSheet, TouchableWithoutFeedback } from "react-native";
import PostActions from "./PostActions/PostActions";
import PostOptionsMenu from "./PostOptionsMenu";
import PhotoFeed from "./Photos/PhotoFeed";
import ViewerOptionsTrigger from "./PostOptionsMenu/ViewerOptionsTrigger";
import PostHeader from "./PostHeader/PostHeader";
import NonOwnerOptions from "./PostOptionsMenu/NonOwnerPostOptions";
import { resolvePostContent } from "../../utils/posts/resolvePostContent";

const pinPic = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

const MaybeTWF = ({ enabled, onPress, children }) =>
  enabled ? (
    <TouchableWithoutFeedback onPress={onPress}>{children}</TouchableWithoutFeedback>
  ) : (
    <Fragment>{children}</Fragment>
  );

export default function CheckInItem({
  item,
  photoTapped,
  setPhotoTapped,
  handleDelete,
  handleEdit,
  onShare,
  embeddedInShared = false,
}) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const postContent = useMemo(() => resolvePostContent(item), [item]);
  const message = postContent?.message;

  const initialHasMedia = useMemo(() => {
    const post = item?.original ?? item ?? {};
    const photos = Array.isArray(post?.photos) ? post.photos : [];
    const media = Array.isArray(post?.media) ? post.media : [];
    return photos.length > 0 || media.length > 0;
  }, [item]);

  const [hasMedia, setHasMedia] = useState(initialHasMedia);

  return (
    <View>
      <MaybeTWF enabled={!!embeddedInShared} onPress={() => { }}>
        <View style={[styles.reviewCard, embeddedInShared && styles.sharedHeader]}>
          <PostOptionsMenu
            dropdownVisible={dropdownVisible}
            setDropdownVisible={setDropdownVisible}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            embeddedInShared={embeddedInShared}
            postData={item}
          />
          <ViewerOptionsTrigger
            post={item}
            embeddedInShared={embeddedInShared}
            onPress={() => setViewerOptionsVisible(true)}
          />
          <View style={styles.section}>
            <PostHeader
              post={item}
              includeAtWithBusiness
              showAtWhenNoTags
              embeddedInShared={embeddedInShared}
            />
            {!!message && <Text style={styles.message}>{message}</Text>}
            {!hasMedia && <Image source={{ uri: pinPic }} style={styles.pinIcon} />}
          </View>
          <PhotoFeed
            post={item}
            scrollX={scrollX}
            photoTapped={photoTapped}
            setPhotoTapped={setPhotoTapped}
            onHasMediaChange={setHasMedia}   // ✅ single source of truth
          />
          <PostActions
            post={item}
            onShare={onShare}
            embeddedInShared={embeddedInShared}
          />
        </View>
      </MaybeTWF>
      <NonOwnerOptions
        visible={viewerOptionsVisible}
        post={item}
        onClose={() => setViewerOptionsVisible(false)}
        embeddedInShared={embeddedInShared}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  reviewCard: {
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 10,
    elevation: 2,
  },
  sharedHeader: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#f9f9f9",
    marginBottom: 10,
  },
  section: {
    padding: 10,
  },
  pinIcon: {
    width: 50,
    height: 50,
    marginBottom: 15,
    alignSelf: "center",
  },
  message: {
    marginBottom: 15,
    fontSize: 16,
  },
});
