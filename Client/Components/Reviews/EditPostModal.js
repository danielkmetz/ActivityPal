import React, { useRef, useEffect, useState } from "react";
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    FlatList,
    Image,
    Alert,
    Dimensions,
    Animated,
    TouchableWithoutFeedback,
    TouchableOpacity,
    Modal,
} from "react-native";
import { AirbnbRating } from "react-native-ratings";
import { useDispatch, useSelector } from "react-redux";
import { editReview } from "../../Slices/ReviewsSlice";
import { editCheckIn } from "../../Slices/CheckInsSlice";
import { selectUser } from "../../Slices/UserSlice";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import TagFriendsModal from "./TagFriendsModal";
import EditPhotosModal from "../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../Profile/EditPhotoDetailsModal";
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { launchImagePickerAndFormat } from "../../functions";
import { handlePhotoUpload } from "../../utils/photoUploadHelper";
import { setUserAndFriendsReviews, selectUserAndFriendsReviews, setProfileReviews, selectProfileReviews } from "../../Slices/ReviewsSlice";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export default function EditPostModal({ visible, post, onClose, onSuccess }) {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const [rating, setRating] = useState(3);
    const [text, setText] = useState("");
    const [taggedUsers, setTaggedUsers] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [editPhotoDetailsVisible, setEditPhotoDetailsVisible] = useState(false);
    const [editPhotosVisible, setEditPhotosVisible] = useState(false);
    const [tagFriendsVisible, setTagFriendsVisible] = useState(false);
    const [previewPhoto, setPreviewPhoto] = useState(null);
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const profileReviews = useSelector(selectProfileReviews);
    const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const gestureThreshold = 100;

    useEffect(() => {
        if (post) {
            setRating(post.rating || 3);
            setText(post.reviewText || post.message || "");
            setTaggedUsers(post.taggedUsers || []);
            setPhotos(post.photos || []);
        }

        if (visible) {
            Animated.timing(translateY, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, post]);

    const closeModal = () => {
        Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            onClose();
        });
    };

    const onGestureEvent = Animated.event(
        [{ nativeEvent: { translationY: translateY } }],
        {
            useNativeDriver: true,
            listener: (event) => {
                const y = event.nativeEvent.translationY;
                if (y < 0) {
                    translateY.setValue(0);
                }
            },
        }
    );

    const handlePhotoAlbumSelection = async () => {
        const newFiles = await launchImagePickerAndFormat();
        if (newFiles.length > 0) {
            setPhotos((prev) => [...prev, ...newFiles]);
            setEditPhotosVisible(true);
        }
    };

    const onHandlerStateChange = ({ nativeEvent }) => {
        if (nativeEvent.state === State.END) {
            if (nativeEvent.translationY > gestureThreshold) {
                closeModal();
            } else {
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }).start();
            }
        }
    };

    const handleUpdate = async () => {
        try {
            const uploadedPhotos = await handlePhotoUpload({
                dispatch,
                userId: user.id,
                placeId: post.placeId,
                photos,
            });

            if (post.type === "review") {
                await dispatch(
                    editReview({
                        placeId: post.placeId,
                        reviewId: post._id,
                        rating,
                        reviewText: text,
                        taggedUsers,
                        photos: uploadedPhotos,
                    })
                ).unwrap();
            } else if (post.type === "check-in") {
                const updatedCheckIn = await dispatch(
                    editCheckIn({
                        userId: user.id,
                        checkInId: post._id,
                        updatedData: {
                            checkInText: text,
                            taggedUsers,
                            photos: uploadedPhotos,
                        },
                    })
                ).unwrap();

                // Map to standard structure: make sure to set `.message` so components using it render correctly
                const updatedCheckInWithMessage = {
                    ...updatedCheckIn.checkIn,
                    message: updatedCheckIn.checkIn.checkInText,
                };

                // Update both reviews lists
                dispatch(setUserAndFriendsReviews(
                    userAndFriendsReviews.map(r => r._id === post._id ? updatedCheckInWithMessage : r)
                ));

                dispatch(setProfileReviews(
                    profileReviews.map(r => r._id === post._id ? updatedCheckInWithMessage : r)
                ));
            }

            onSuccess?.();
            closeModal();
        } catch (err) {
            Alert.alert("Error", "Failed to update post");
        }
    };

    const handlePhotoSave = (updatedPhoto) => {
        setPhotos((prev) =>
            prev.map((photo) => {
                const matchByUri = photo.uri && updatedPhoto.uri && photo.uri === updatedPhoto.uri;
                const matchByKey = photo.photoKey && updatedPhoto.photoKey && photo.photoKey === updatedPhoto.photoKey;
                const matchById = photo._id && updatedPhoto._id && photo._id === updatedPhoto._id;

                return matchByUri || matchByKey || matchById
                    ? { ...photo, ...updatedPhoto }
                    : photo;
            })
        );
        setEditPhotoDetailsVisible(false);
    };

    const renderFriendPills = (list) => (
        <View style={styles.inviteesRow}>
            {list.map((recipient, index) => (
                <View key={recipient.userId || recipient._id || index} style={styles.pill}>
                    <Image
                        source={
                            recipient.presignedProfileUrl || recipient.profilePicUrl
                                ? { uri: recipient.presignedProfileUrl || recipient.profilePicUrl }
                                : profilePicPlaceholder
                        }
                        style={styles.profilePic}
                    />
                    <Text style={styles.pillText}>
                        {recipient.firstName || recipient.fullName || 'Unknown'}
                    </Text>
                </View>
            ))}
        </View>
    );

    return (
        <Modal visible={visible} animationType="none" transparent onRequestClose={closeModal}>
            <TouchableWithoutFeedback onPress={closeModal}>
                <View style={styles.overlay}>
                    <PanGestureHandler
                        onGestureEvent={onGestureEvent}
                        onHandlerStateChange={onHandlerStateChange}
                    >
                        <Animated.View
                            style={[styles.container, { transform: [{ translateY }] }]}
                        >
                            <View style={styles.notchContainer}>
                                <View style={styles.notch} />
                            </View>

                            {post?.type === "review" && (
                                <>
                                    <Text style={styles.label}>Edit Rating</Text>
                                    <AirbnbRating
                                        count={5}
                                        defaultRating={rating}
                                        size={20}
                                        showRating={false}
                                        onFinishRating={setRating}
                                    />
                                </>
                            )}

                            <Text style={styles.label}>
                                {post?.type === "review" ? "Edit Review" : "Edit Message"}
                            </Text>
                            <TextInput
                                style={styles.textArea}
                                multiline
                                value={text}
                                onChangeText={setText}
                            />

                            <Text style={styles.label}>Tagged Friends</Text>
                            {taggedUsers.length > 0 ? renderFriendPills(taggedUsers) : (
                                <Text style={{ color: '#888', marginBottom: 10 }}>No friends tagged yet.</Text>
                            )}

                            <TouchableOpacity
                                style={styles.uploadButton}
                                onPress={() => setTagFriendsVisible(true)}
                            >
                                <Text style={styles.uploadButtonText}>Edit Tagged Friends 🏷️</Text>
                            </TouchableOpacity>

                            {photos.length > 0 && (
                                <FlatList
                                    data={photos}
                                    horizontal
                                    keyExtractor={(item, index) => index.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity onPress={() => {
                                            setPreviewPhoto(item);
                                            setEditPhotoDetailsVisible(true);
                                        }}>
                                            <Image source={{ uri: item.url || item.uri }} style={styles.photoPreview} />
                                        </TouchableOpacity>
                                    )}
                                />
                            )}

                            <TouchableOpacity onPress={handlePhotoAlbumSelection} style={styles.editButton}>
                                <Text style={styles.editButtonText}>Edit/Add Photos 🖼️</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.updateButton} onPress={handleUpdate}>
                                <Text style={styles.updateButtonText}>Update</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </PanGestureHandler>

                    <TagFriendsModal
                        visible={tagFriendsVisible}
                        onSave={setTaggedUsers}
                        onClose={() => setTagFriendsVisible(false)}
                        initialSelectedFriends={taggedUsers}
                    />

                    <EditPhotosModal
                        visible={editPhotosVisible}
                        photos={photos}
                        onSave={setPhotos}
                        photoList={photos}
                        setPhotoList={setPhotos}
                        onClose={() => setEditPhotosVisible(false)}
                    />

                    <EditPhotoDetailsModal
                        visible={editPhotoDetailsVisible}
                        photo={previewPhoto}
                        onClose={() => setEditPhotoDetailsVisible(false)}
                        onSave={handlePhotoSave}
                        setPhotoList={setPhotos}
                    />
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    container: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        maxHeight: SCREEN_HEIGHT * 0.75,
    },
    notchContainer: {
        alignItems: "center",
        marginBottom: 15,
    },
    notch: {
        width: 40,
        height: 5,
        backgroundColor: "#ccc",
        borderRadius: 3,
    },
    label: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 10,
    },
    uploadButton: {
        backgroundColor: 'teal',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 15,
    },
    uploadButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    textArea: {
        height: 100,
        borderColor: "#ccc",
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        marginBottom: 20,
        textAlignVertical: "top",
    },
    updateButton: {
        backgroundColor: "#2196F3",
        padding: 12,
        borderRadius: 10,
        alignItems: "center",
        marginTop: 10,
    },
    updateButtonText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 16,
    },
    editButton: {
        backgroundColor: "#4caf50",
        padding: 10,
        borderRadius: 8,
        alignItems: "center",
        marginBottom: 10,
    },
    editButtonText: {
        color: "white",
        fontWeight: "bold",
    },
    photoPreview: {
        width: 80,
        height: 80,
        borderRadius: 8,
        marginRight: 10,
    },
    inviteesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 10,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0f0f0',
        borderRadius: 15,
        paddingVertical: 4,
        paddingHorizontal: 8,
        margin: 4,
    },
    pillText: {
        fontSize: 14,
        marginLeft: 5,
        color: '#333',
    },
    profilePic: {
        width: 24,
        height: 24,
        borderRadius: 12,
    },

});
