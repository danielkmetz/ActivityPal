import React, { useState, useRef } from "react";
import {
    View,
    Text,
    Image,
    FlatList,
    Animated,
    StyleSheet,
    Dimensions,
} from "react-native";
import PhotoItem from "./PhotoItem";
import PhotoPaginationDots from "./PhotoPaginationDots";
import PostActions from './PostActions';
import { selectUser } from "../../Slices/UserSlice";
import { useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import PostOptionsMenu from "./PostOptionsMenu";
import StoryAvatar from "../Stories/StoryAvatar";

const pinPic = "https://cdn-icons-png.flaticon.com/512/684/684908.png";

const screenWidth = Dimensions.get("window").width;

export default function CheckInItem({
    item,
    likedAnimations,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    handleOpenComments,
    lastTapRef,
    handleDelete,
    handleEdit,
}) {
    const navigation = useNavigation();
    const user = useSelector(selectUser);
    const isSender = item.userId === user?.id;
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const currentPhoto = item.photos?.[currentPhotoIndex];

    const handleOpenFullScreen = (photo, index) => {
        navigation.navigate('FullScreenPhoto', {
            review: item,
            initialIndex: index,
            lastTapRef,
            likedAnimations,
            taggedUsersByPhotoKey: item.taggedUsersByPhotoKey || {}, // or however you pass it
            handleLikeWithAnimation,
        });
    };

    return (
        <View style={styles.reviewCard}>
            <PostOptionsMenu
                isSender={isSender}
                dropdownVisible={dropdownVisible}
                setDropdownVisible={setDropdownVisible}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
                postData={item}
            />
            <View style={styles.section}>
                <View style={styles.userPicAndName}>
                    <StoryAvatar userId={item?.userId} profilePicUrl={item.profilePicUrl} />
                    <View style={{ flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                        <Text style={styles.userEmailText}>
                            <Text style={styles.name}>{item.fullName}</Text>
                            {item.taggedUsers?.length > 0 ? (
                                <>
                                    <Text style={styles.business}> is with </Text>
                                    {item.taggedUsers.map((user, index) => (
                                        <Text key={user._id || index} style={styles.name}>
                                            {user.fullName}
                                            {index < item.taggedUsers.length - 1 ? ", " : ""}
                                        </Text>
                                    ))}
                                    <Text style={styles.business}> at </Text>
                                    <Text style={styles.business}>{item.businessName}</Text>
                                </>
                            ) : (
                                <>
                                    <Text style={styles.business}> is at </Text>
                                    <Text style={styles.business}>{item.businessName}</Text>
                                </>
                            )}
                            {item.photos.length > 0 && (
                                <Image
                                    source={{ uri: pinPic }}
                                    style={styles.smallPinIcon}
                                />
                            )}
                        </Text>
                    </View>
                </View>
                <Text style={styles.message}>{item.message || null}</Text>
                {item.photos?.length === 0 && (
                    <Image
                        source={{
                            uri: pinPic,
                        }}
                        style={styles.pinIcon}
                    />
                )}
            </View>
            {item.photos?.length > 0 && (
                <View>
                    <FlatList
                        data={item.photos}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(photo, index) => index.toString()}
                        scrollEnabled={item.photos.length > 1}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                            {
                                useNativeDriver: false,
                                listener: (e) => {
                                    const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                                    setCurrentPhotoIndex(index);
                                },
                            }
                        )}
                        scrollEventThrottle={16}
                        renderItem={({ item: photo, index }) => (
                            <PhotoItem
                                photo={photo}
                                reviewItem={item}
                                index={index}
                                likedAnimations={likedAnimations}
                                photoTapped={photoTapped}
                                toggleTaggedUsers={toggleTaggedUsers}
                                handleLikeWithAnimation={handleLikeWithAnimation}
                                lastTapRef={lastTapRef}
                                onOpenFullScreen={handleOpenFullScreen}
                            />
                        )}
                    />
                    <PhotoPaginationDots photos={item.photos} scrollX={scrollX} />
                </View>
            )}
            <Text style={styles.date}>
                Posted:{" "}
                {item.date
                    ? new Date(item.date).toISOString().split("T")[0]
                    : "Now"}
            </Text>
            <PostActions
                item={item}
                handleLikeWithAnimation={handleLikeWithAnimation}
                handleOpenComments={handleOpenComments}
                toggleTaggedUsers={toggleTaggedUsers}
                photo={currentPhoto}
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
    },
    userPicAndName: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 15,
        padding: 6,
        paddingRight: 30,
    },
    profilePic: {
        marginRight: 10,
    },
    userEmailText: {
        fontSize: 18,
    },
    name: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    business: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#555",
    },
    smallPinIcon: {
        width: 16,
        height: 16,
        marginLeft: 5,
        marginBottom: -5,
        marginTop: 5,
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
    actionsContainer: {
        flexDirection: "row",
        padding: 15,
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
});
