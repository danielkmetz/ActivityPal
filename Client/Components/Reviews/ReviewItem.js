import React, { useState, useRef, Fragment } from "react";
import { View, StyleSheet, Animated, TouchableWithoutFeedback } from "react-native";
import PostActions from "./PostActions/PostActions";
import PostOptionsMenu from "./PostOptionsMenu";
import ExpandableText from "./ExpandableText";
import PhotoFeed from "./Photos/PhotoFeed";
import PostHeader from "./PostHeader/PostHeader";
import NonOwnerOptions from "./PostOptionsMenu/NonOwnerPostOptions";
import ViewerOptionsTrigger from "./PostOptionsMenu/ViewerOptionsTrigger";
import BusinessLink from "./PostHeader/BusinessLink";
import ReviewMetaRow from "./ReviewItem/ReviewMetaRow";

const MaybeTWF = ({ enabled, onPress, children }) =>
  enabled ? (
    <TouchableWithoutFeedback onPress={onPress}>{children}</TouchableWithoutFeedback>
  ) : (
    <Fragment>{children}</Fragment>
  );

export default function ReviewItem({
  item,
  photoTapped,
  setPhotoTapped,
  handleEdit,
  handleDelete,
  onShare,
  embeddedInShared = false,
}) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);
  const [activeMediaItem, setActiveMediaItem] = useState(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const card = (
    <View style={styles.reviewCard}>
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
          includeAtWithBusiness={false}
          showAtWhenNoTags={false}
          embeddedInShared={embeddedInShared}
        />
        <ExpandableText post={item} maxLines={4} textStyle={styles.review} />
        <BusinessLink post={item} />
        <ReviewMetaRow post={item} />
      </View>
      <PhotoFeed
        scrollX={scrollX}
        post={item}
        photoTapped={photoTapped}
        setPhotoTapped={setPhotoTapped}
        onActiveMediaChange={setActiveMediaItem} // ✅ PhotoFeed will set initial + on swipe
      />
      <PostActions
        post={item}
        onShare={onShare}
        embeddedInShared={embeddedInShared}
        photo={activeMediaItem}
      />
    </View>
  );

  return (
    <View>
      <MaybeTWF enabled={!!embeddedInShared}>{card}</MaybeTWF>
      <NonOwnerOptions
        visible={viewerOptionsVisible}
        embeddedInShared={embeddedInShared}
        post={item}
        onClose={() => setViewerOptionsVisible(false)}
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
  section: {
    padding: 10,
    flexShrink: 1,
  },
  review: {
    fontSize: 16,
    marginBottom: 15,
  },
});
