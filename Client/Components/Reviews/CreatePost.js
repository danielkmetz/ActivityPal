import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native";
import { FontAwesome, AntDesign } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import { Rating } from "react-native-ratings";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import EditPhotosModal from "../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../Profile/EditPhotoDetailsModal";
import TagFriendsModal from "./TagFriendsModal";
import VideoThumbnail from "./VideoThumbnail";
import { selectUser } from "../../Slices/UserSlice";
import { uploadReviewPhotos } from "../../Slices/PhotosSlice";
import { editReview } from "../../Slices/ReviewsSlice";
import { createReview } from "../../Slices/ReviewsSlice";
import { createCheckIn } from "../../Slices/CheckInsSlice";
import { createNotification } from "../../Slices/NotificationsSlice";
import { createBusinessNotification } from "../../Slices/BusNotificationsSlice";
import { selectMediaFromGallery } from "../../utils/selectPhotos";
import { googlePlacesDefaultProps } from "../../utils/googleplacesDefaults";
import { handlePhotoUpload } from "../../utils/photoUploadHelper";
import { isVideo } from "../../utils/isVideo";
import InviteForm from "../ActivityInvites/InviteForm";
import FriendPills from './FriendPills';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;

export default function CreatePost() {
  const navigation = useNavigation();
  const route = useRoute();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const [postType, setPostType] = useState(route.params?.postType);
  const [business, setBusiness] = useState(null);
  const [rating, setRating] = useState(3);
  const [review, setReview] = useState("");
  const [checkInMessage, setCheckInMessage] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [photoList, setPhotoList] = useState([]);
  const [taggedUsers, setTaggedUsers] = useState([]);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
  const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
  const [tagFriendsModalVisible, setTagFriendsModalVisible] = useState(false);
  const isEditing = route.params?.isEditing || false;
  const initialPost = route.params?.initialPost || null;
  const googlePlacesRef = useRef(null);
  const fullName = `${user.firstName} ${user?.lastName}`;
  const userId = user.id;

  useEffect(() => {
    if (isEditing && initialPost) {
      setPostType(initialPost.type); // "review" or "check-in"
      setReview(initialPost.reviewText || "");
      setCheckInMessage(initialPost.message || "");
      setTaggedUsers(initialPost.taggedUsers || []);
      setSelectedPhotos(initialPost.photos || []);
      setPhotoList(initialPost.photos || []);
      setBusiness({
        place_id: initialPost.placeId,
        name: initialPost.businessName,
        formatted_address: initialPost.location || "",
      });
      setRating(initialPost.rating || 3);

      if (initialPost.businessName) {
        googlePlacesRef.current?.setAddressText(`${initialPost.businessName}`);
      }
    }
  }, [isEditing, initialPost]);

  useEffect(() => {
    setPhotoList(selectedPhotos);
  }, [selectedPhotos]);

  const handlePhotoAlbumSelection = async () => {
    const newFiles = await selectMediaFromGallery();
    if (newFiles.length > 0) {
      const prepared = newFiles.map(file => ({
        ...file,
        taggedUsers: [],
        description: file.description || "",
        uri: file.uri,
      }));
      setSelectedPhotos(prev => [...prev, ...prepared]);
      setPhotoList(prev => [...prev, ...prepared]);
      setEditPhotosModalVisible(true);
    }
  };

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList((prev) =>
      prev.map((photo) => {
        const matchByUri = photo.uri && updatedPhoto.uri && photo.uri === updatedPhoto.uri;
        const matchByKey = photo.photoKey && updatedPhoto.photoKey && photo.photoKey === updatedPhoto.photoKey;
        const matchById = photo._id && updatedPhoto._id && photo._id === updatedPhoto._id;

        return matchByUri || matchByKey || matchById
          ? { ...photo, ...updatedPhoto }
          : photo;
      })
    );
    setPhotoDetailsEditing(false);
  };

  const handleSubmit = async () => {
    console.log("🟡 Submitting post...");
    console.log("Post Type:", postType);
    console.log("Business:", business);
    console.log("Review text:", review);
    console.log("Check-in message:", checkInMessage);
    console.log("Tagged Users:", taggedUsers);
    console.log("Selected Photos:", selectedPhotos);

    if (!business || (postType === "review" && !review.trim())) {
      console.log("❌ Missing business or review text");
      Alert.alert("Error", "Please fill in all required fields.");
      return;
    }

    try {
      let uploadedPhotos = [];
      
      if (selectedPhotos.length > 0) {
        console.log("📸 Uploading photos...");
        uploadedPhotos = await handlePhotoUpload({
          dispatch,
          userId: user.id,
          placeId: initialPost.placeId,
          photos: photoList,
        });
      }

      let postId = null;

      if (isEditing && initialPost) {
        console.log("✏️ Editing existing post", initialPost._id);

        if (postType === "review") {
          await dispatch(
            editReview({
              placeId: business.place_id,
              reviewId: initialPost._id,
              rating,
              reviewText: review.trim(),
              taggedUsers,
              photos: uploadedPhotos,
            })
          ).unwrap();
          postId = initialPost._id;
        } else {
          const taggedUserIds = taggedUsers.map(friend => friend._id || friend.userId || friend.id);
          await dispatch(
            editCheckIn({
              userId,
              checkInId: initialPost._id,
              updatedData: {
                message: checkInMessage.trim(),
                taggedUsers: taggedUserIds,
                photos: uploadedPhotos,
                placeId: business.place_id,
              },
            })
          ).unwrap();
          postId = initialPost._id;
        }

        console.log("✅ Edit successful. Post ID:", postId);
        Alert.alert("Success", `Your ${postType} has been updated!`);
        navigation.goBack();
        return;
      }

      console.log("➕ Creating new post...");

      if (postType === "review") {
        const reviewResponse = await dispatch(
          createReview({
            placeId: business.place_id,
            businessName: business.name,
            userId,
            fullName,
            rating,
            reviewText: review.trim(),
            photos: uploadedPhotos,
            taggedUsers,
          })
        ).unwrap();
        postId = reviewResponse._id;
      } else {
        const taggedUserIds = taggedUsers.map(friend => friend._id || friend.userId || friend.id);
        const checkInResponse = await dispatch(
          createCheckIn({
            placeId: business.place_id,
            location: business.formatted_address,
            businessName: business.name,
            userId,
            fullName,
            message: checkInMessage.trim() || null,
            taggedUsers: taggedUserIds,
            photos: uploadedPhotos,
          })
        ).unwrap();
        postId = checkInResponse._id;
      }

      console.log("📬 Post created. ID:", postId);

      await Promise.all([
        ...taggedUsers.map(user =>
          dispatch(createNotification({
            userId: user._id || user.userId,
            type: "tag",
            message: `${fullName} tagged you in a ${postType}!`,
            relatedId: userId,
            typeRef: "User",
            targetId: postId,
            postType,
          }))
        ),
        ...uploadedPhotos.flatMap(photo =>
          photo.taggedUsers.map(user =>
            dispatch(createNotification({
              userId: user.userId,
              type: "photoTag",
              message: `${fullName} tagged you in a photo!`,
              relatedId: userId,
              typeRef: "User",
              targetId: postId,
              postType,
            }))
          )
        ),
        dispatch(createBusinessNotification({
          placeId: business.place_id,
          postType,
          type: postType,
          message: `${fullName} ${postType === "review" ? "left a review on" : "checked in at"} ${business.name}`,
          relatedId: userId,
          typeRef: "User",
          targetId: postId,
          targetRef: "Review",
        })),
      ]);

      console.log("📢 Notifications dispatched");
      Alert.alert("Success", `Your ${postType} has been posted!`);
      navigation.goBack();
    } catch (err) {
      console.error("🔥 Submission error:", err);
      Alert.alert("Error", err.message || "Failed to submit.");
    }
  };

  const handleOpenPhotoDetails = (item) => {
    setPhotoDetailsEditing(true);
    setPreviewPhoto(item)
  };

  const handleClosePhotoDetails = () => {
    setPhotoDetailsEditing(false);
    setPreviewPhoto(null);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <FlatList
            data={[]} // No data needed; we use header only
            keyExtractor={() => "static"}
            renderItem={null}
            ListHeaderComponent={
              <>
                <View style={styles.toggleContainer}>
                  {["review", "check-in", "invite"].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.toggleButton,
                        postType === type && styles.activeToggleButton
                      ]}
                      onPress={() => setPostType(type)}
                    >
                      <Text style={[
                        styles.toggleButtonText,
                        postType === type && styles.activeToggleButtonText
                      ]}>
                        {type === "review" ? "Review" : type === "check-in" ? "Check-in" : "Invite"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {postType !== "invite" && (
                  <GooglePlacesAutocomplete
                    ref={googlePlacesRef}
                    placeholder="Search for a business"
                    fetchDetails
                    onPress={(data, details) => {
                      setBusiness(details);
                    }}
                    query={{ key: GOOGLE_API_KEY, language: "en", types: "establishment" }}
                    styles={{
                      textInput: styles.input,
                      listView: { backgroundColor: "#fff", maxHeight: 250 },
                    }}
                    {...googlePlacesDefaultProps}
                  />
                )}

                {postType === "review" && (
                  <>
                    <Text style={styles.label}>Rating</Text>
                    <View style={{ alignItems: 'flex-start' }}>
                      <Rating count={5} startingValue={rating} onFinishRating={setRating} />
                    </View>
                    <Text style={styles.label}>Your Review</Text>
                    <TextInput
                      style={styles.textArea}
                      value={review}
                      onChangeText={setReview}
                      multiline
                    />
                  </>
                )}

                {postType === "check-in" && (
                  <>
                    <Text style={styles.label}>Check-in Message (optional)</Text>
                    <TextInput
                      style={styles.textArea}
                      value={checkInMessage}
                      onChangeText={setCheckInMessage}
                      multiline
                    />
                  </>
                )}

                {postType === "invite" && (
                  <InviteForm isEditing={isEditing} initialInvite={initialPost} />
                )}

                {selectedPhotos.length > 0 && (
                  <>
                    <Text style={styles.label}>Media</Text>
                    <FlatList
                      data={selectedPhotos}
                      horizontal
                      keyExtractor={(item, i) => i.toString()}
                      renderItem={({ item }) => (
                        <TouchableOpacity onPress={() => handleOpenPhotoDetails(item)}>
                          {isVideo(item) ? (
                            <VideoThumbnail file={item} width={80} height={80} />
                          ) : (
                            <Image source={{ uri: item.uri || item.url }} style={styles.media} />
                          )}
                        </TouchableOpacity>
                      )}
                    />
                  </>
                )}

                <Text style={styles.label}>Tagged Friends</Text>
                {taggedUsers.length > 0 ? (
                  <FriendPills friends={taggedUsers} />
                ) : (
                  <Text style={{ color: "#888", marginBottom: 10 }}>No friends tagged yet.</Text>
                )}

                {postType !== "invite" && (
                  <>
                    <View style={styles.iconActionRow}>
                      <TouchableOpacity style={styles.iconAction} onPress={() => navigation.navigate("CameraScreen")}>
                        <FontAwesome name="camera" size={24} color="black" />
                        <Text style={styles.iconLabel}>Camera</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.iconAction} onPress={handlePhotoAlbumSelection}>
                        <FontAwesome name="picture-o" size={24} color="black" />
                        <Text style={styles.iconLabel}>Library</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.iconAction} onPress={() => setTagFriendsModalVisible(true)}>
                        <AntDesign name="tag" size={24} color="black" />
                        <Text style={styles.iconLabel}>Tag</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={handleSubmit} style={styles.submitButton}>
                      <Text style={styles.submitButtonText}>Post</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            }
            contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 16, marginTop: 120 }}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </TouchableWithoutFeedback>

      {/* Modals */}
      <TagFriendsModal
        visible={tagFriendsModalVisible}
        onSave={setTaggedUsers}
        onClose={() => setTagFriendsModalVisible(false)}
        initialSelectedFriends={taggedUsers}
      />
      <EditPhotosModal
        visible={editPhotosModalVisible}
        photos={selectedPhotos}
        onSave={setSelectedPhotos}
        photoList={photoList}
        setPhotoList={setPhotoList}
        onClose={() => setEditPhotosModalVisible(false)}
      />
      {previewPhoto && (
        <EditPhotoDetailsModal
          visible={photoDetailsEditing}
          photo={previewPhoto}
          onClose={handleClosePhotoDetails}
          onSave={handlePhotoSave}
          setPhotoList={setPhotoList}
          setSelectedPhotos={setSelectedPhotos}
          onDelete={() => { }}
          isPromotion={false}
        />
      )}
    </KeyboardAvoidingView>
  );

}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "white", marginTop: 120 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  label: { fontSize: 14, fontWeight: 500, marginVertical: 10 },
  input: {
    backgroundColor: "#f5f5f5",
    height: 50,
    borderRadius: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    fontSize: 16,
  },
  textArea: {
    height: 100,
    backgroundColor: "#fff",
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    marginBottom: 15,
    textAlignVertical: "top",
  },
  buttonRow: { flexDirection: "row", justifyContent: "space-around", marginVertical: 10 },
  button: { backgroundColor: "teal", padding: 10, borderRadius: 8 },
  buttonText: { color: "#fff", fontWeight: "bold" },
  submitButton: {
    backgroundColor: "#009999",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  toggleButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeToggleButton: {
    borderBottomColor: 'tomato',
  },
  toggleButtonText: {
    fontSize: 16,
    color: '#777',
  },
  activeToggleButtonText: {
    color: 'tomato',
    fontWeight: 'bold',
  },
  iconActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',

  },
  iconAction: {
    alignItems: 'center',
    width: 80,
    gap: 6,
  },
  iconLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    marginTop: 4,
  },
  submitButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  media: { width: 80, height: 80, marginRight: 10, borderRadius: 8 },
});
