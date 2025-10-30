import React, { useState, useRef, useEffect, Fragment } from "react";
import { View, StyleSheet, Animated, TouchableWithoutFeedback } from "react-native";
import PostActions from "./PostActions/PostActions";
import PostOptionsMenu from "./PostOptionsMenu";
import ExpandableText from "./ExpandableText";
import PhotoFeed from "./Photos/PhotoFeed";
import RatingsButton from './ReviewItem/RatingsButton';
import PostHeader from './PostHeader/PostHeader';
import NonOwnerOptions from './PostOptionsMenu/NonOwnerPostOptions';
import ViewerOptionsTrigger from './PostOptionsMenu/ViewerOptionsTrigger';
import BusinessLink from './PostHeader/BusinessLink';
import PostedDate from './PostedDate';

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
    toggleTaggedUsers,
    handleEdit,
    handleDelete,
    onShare,
    embeddedInShared = false,
}) {
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const currentIndexRef = useRef(0);
    const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);
    const scrollX = useRef(new Animated.Value(0)).current;
    const postContent = item?.original ? item?.original : item;
    const currentPhoto = postContent.photos?.[currentPhotoIndex];

    useEffect(() => {
        const interval = setInterval(() => {
            if (currentPhotoIndex !== currentIndexRef.current) {
                setCurrentPhotoIndex(currentIndexRef.current);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [currentPhotoIndex]);

    const card = (
        <View style={styles.reviewCard}>
            <PostOptionsMenu
                dropdownVisible={dropdownVisible}
                setDropdownVisible={setDropdownVisible}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
                postData={item}
            />
            <ViewerOptionsTrigger
                post={item}
                onPress={() => setViewerOptionsVisible(true)}
            />
            <View style={styles.section}>
                <PostHeader
                    post={item}
                    // Reviews: business shown on its own line below, so keep both false
                    includeAtWithBusiness={false}
                    showAtWhenNoTags={false}
                />
                <BusinessLink post={item} />
                <RatingsButton post={item} />
                <ExpandableText
                    post={item}
                    maxLines={4}
                    textStyle={styles.review}
                />
            </View>
            {/* ✅ Photos */}
            <PhotoFeed
                scrollX={scrollX}
                post={item}
                photoTapped={photoTapped}
                currentIndexRef={{ current: currentPhotoIndex, setCurrent: setCurrentPhotoIndex }}
            />
            <PostedDate post={item} />
            <View style={{ padding: 15 }}>
                <PostActions
                    post={item}
                    setPhotoTapped={setPhotoTapped}
                    toggleTaggedUsers={toggleTaggedUsers}
                    photo={currentPhoto}
                    onShare={onShare}
                    onRequestShowTags={(photoKey) => toggleTaggedUsers?.(photoKey)}   // or a deterministic show fn
                />
            </View>
        </View>
    )

    return (
        <View>
            <MaybeTWF enabled={!!embeddedInShared}>
                {card}
            </MaybeTWF>
            <NonOwnerOptions
                visible={viewerOptionsVisible}
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
        marginTop: 5,
    },
});
