import React, { useState, useRef } from "react";
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    Animated,
    Dimensions,
} from "react-native";
import { Avatar } from "@rneui/themed";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import profilePicPlaceholder from "../../assets/pics/profile-pic-placeholder.jpg";
import PhotoItem from "./PhotoItem";
import PhotoPaginationDots from "./PhotoPaginationDots";
import PostActions from "./PostActions";
import PostOptionsMenu from "./PostOptionsMenu";
import ExpandableText from "./ExpandableText";
import { selectUser } from '../../Slices/UserSlice';
import { useSelector } from "react-redux";
import FullScreenPhotoModal from "./FullScreenPhotoModal";

const screenWidth = Dimensions.get("window").width;

export default function ReviewItem({
    item,
    likedAnimations,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    handleOpenComments,
    lastTapRef,
    handleEdit,
    handleDelete,
}) {
    const user = useSelector(selectUser);
    const isSender = item.userId === user?.id;
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const [fullScreenPhoto, setFullScreenPhoto] = useState(null);
    const [fullScreenIndex, setFullScreenIndex] = useState(0);
    const [photoModalVisible, setPhotoModalVisible] = useState(false);
    const scrollX = useRef(new Animated.Value(0)).current;

    const currentPhoto = item.photos?.[currentPhotoIndex];

    const handleOpenFullScreen = (photo, index) => {
        setFullScreenPhoto(photo);
        setPhotoModalVisible(true);
        setFullScreenIndex(index);
    };

    const taggedUsersByPhotoKey = Object.fromEntries(
        (item.photos || []).map((photo) => [
          photo.photoKey,
          photo.taggedUsers || [],
        ])
    );  

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
                    <View style={styles.profilePic}>
                        <Avatar
                            size={45}
                            rounded
                            source={item?.profilePicUrl ? { uri: item.profilePicUrl } : profilePicPlaceholder}
                            icon={!item?.profilePicUrl ? { name: "person", type: "material", color: "#fff" } : null}
                            containerStyle={{ backgroundColor: "#ccc" }}
                        />
                    </View>

                    <View style={{ flexShrink: 1 }}>
                        <Text style={styles.userEmailText}>
                            {item.fullName}
                            {item.taggedUsers?.length > 0 && (
                                <>
                                    <Text style={styles.business}> is with </Text>
                                    {item.taggedUsers.map((user, index) => (
                                        <Text key={user._id || index} style={styles.userEmailText}>
                                            {user.fullName}
                                            {index < item.taggedUsers.length - 1 ? ", " : ""}
                                        </Text>
                                    ))}
                                </>
                            )}
                        </Text>
                    </View>
                </View>

                <Text style={styles.business}>{item.businessName}</Text>
                <View style={styles.rating}>
                    {Array.from({ length: item.rating }).map((_, index) => (
                        <MaterialCommunityIcons
                            key={index}
                            name="star"
                            size={20}
                            color="gold"
                        />
                    ))}
                </View>
                <ExpandableText
                    text={item.reviewText}
                    maxLines={4}
                    textStyle={styles.review}
                />
            </View>
            {/* ✅ Photos */}
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
                                index={index}
                                reviewItem={item}
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
                Posted: {item.date ? new Date(item.date).toISOString().split("T")[0] : "Now"}
            </Text>

            <PostActions
                item={item}
                handleLikeWithAnimation={handleLikeWithAnimation}
                handleOpenComments={handleOpenComments}
                toggleTaggedUsers={toggleTaggedUsers}
                photo={currentPhoto}
            />

            <FullScreenPhotoModal
                visible={photoModalVisible}
                photo={fullScreenPhoto}
                setPhotoModalVisible={setPhotoModalVisible}
                initialIndex={fullScreenIndex}
                review={item}
                likedAnimations={likedAnimations}
                lastTapRef={lastTapRef}
                photoTapped={photoTapped}
                toggleTaggedUsers={toggleTaggedUsers}
                taggedUsersByPhotoKey={taggedUsersByPhotoKey}
                handleLikeWithAnimation={handleLikeWithAnimation}
                onClose={() => {
                    setFullScreenPhoto(null);
                    setPhotoModalVisible(false);
                }}
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
    profilePic: {
        marginRight: 10,
    },
    userPicAndName: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 15,
        padding: 6,
    },
    userEmailText: {
        fontSize: 18,
        fontWeight: "bold",
    },
    business: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#555",
    },
    rating: {
        fontSize: 14,
        flexDirection: "row",
    },
    review: {
        fontSize: 16,
        marginTop: 5,
    },
    message: {
        marginBottom: 15,
        fontSize: 16,
    },
    smallPinIcon: {
        width: 20,
        height: 20,
        marginLeft: 5,
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
    seeMore: {
        color: '#007AFF',
        fontSize: 14,
        marginTop: 5,
    }
});
