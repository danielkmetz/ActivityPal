import React, { useState, useRef, Fragment } from "react";
import {
    View,
    Text,
    Image,
    Animated,
    StyleSheet,
    TouchableWithoutFeedback,
} from "react-native";
import PostActions from './PostActions/PostActions';
import PostOptionsMenu from "./PostOptionsMenu";
import PhotoFeed from "./Photos/PhotoFeed";
import ViewerOptionsTrigger from "./PostOptionsMenu/ViewerOptionsTrigger";
import PostHeader from './PostHeader/PostHeader';
import NonOwnerOptions from "./PostOptionsMenu/NonOwnerPostOptions";
import PostedDate from "./PostedDate";

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
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);
    const scrollX = useRef(new Animated.Value(0)).current;
    const postContent = item?.original ? item?.original : item
    const message = postContent?.message || postContent?.message;

    return (
        <MaybeTWF enabled={!!embeddedInShared} onPress={() => { }}>
            <View style={[styles.reviewCard, embeddedInShared && styles.sharedHeader]}>
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
                        includeAtWithBusiness
                        showAtWhenNoTags
                    />
                    <Text style={styles.message}>{message || null}</Text>
                    {postContent?.photos?.length === 0 && (
                        <Image
                            source={{
                                uri: pinPic,
                            }}
                            style={styles.pinIcon}
                        />
                    )}
                </View>
                <PhotoFeed
                    post={item}
                    scrollX={scrollX}
                    currentIndexRef={{ current: currentPhotoIndex, setCurrent: setCurrentPhotoIndex }}
                    photoTapped={photoTapped}
                    setPhotoTapped={setPhotoTapped}
                />
                <PostedDate post={item} />
                <PostActions
                    post={item}
                    onShare={onShare}
                />
            </View>
            <NonOwnerOptions
                visible={viewerOptionsVisible}
                post={item}
                onClose={() => setViewerOptionsVisible(false)}
            />
        </MaybeTWF>
    );
}

const styles = StyleSheet.create({
    reviewCard: {
        backgroundColor: "#fff",
        borderRadius: 5,
        marginBottom: 10,
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sharedHeader: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 8,
        backgroundColor: '#f9f9f9', // optional for "Facebook shared" look
        marginBottom: 10,
    },
    section: {
        padding: 10,
    },
    business: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#555",
    },
    pinIcon: {
        width: 50,
        height: 50,
        marginTop: 15,
        alignSelf: "center",
    },
    message: {
        marginBottom: 15,
        fontSize: 16,
    },
    date: {
        fontSize: 12,
        color: "#555",
        marginLeft: 10,
        marginTop: 10,
    },
});
