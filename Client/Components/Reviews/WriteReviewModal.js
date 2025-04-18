import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Alert,
  Platform,
  FlatList,
  Image,
} from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import * as ImagePicker from "expo-image-picker";
import { AirbnbRating } from "react-native-ratings";
import { useDispatch } from "react-redux";
import { createReview } from "../../Slices/ReviewsSlice";
import { selectUser } from "../../Slices/UserSlice";
import { useSelector } from "react-redux";
import EditPhotosModal from "../Profile/EditPhotosModal";
import { uploadReviewPhotos } from "../../Slices/PhotosSlice";
import { createCheckIn } from "../../Slices/CheckInsSlice";
import TagFriendsModal from "./TagFriendsModal";
import EditPhotoDetailsModal from "../Profile/EditPhotoDetailsModal";
import { createNotification } from "../../Slices/NotificationsSlice";

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;

const WriteReviewModal = ({ visible, onClose, setReviewModalVisible, business, setBusiness, setBusinessName, businessName }) => {
  const dispatch = useDispatch();
  const [rating, setRating] = useState(3);
  const [review, setReview] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState("");
  const [taggedUsers, setTaggedUsers] = useState([]);
  const [selectedTab, setSelectedTab] = useState("review");
  const [tagFriendsModalVisible, setTagFriendsModalVisible] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
  const [photoList, setPhotoList] = useState([]);
  const user = useSelector(selectUser);
  const userId = user.id;
  const fullName = `${user.firstName} ${user?.lastName}`;
  const googlePlacesRef = useRef(null);

  useEffect(() => {
    if (visible && business && googlePlacesRef.current) {
      googlePlacesRef.current.setAddressText(`${business.name}, ${business.formatted_address}`);
    }
  }, [visible, business]);

  // Update photoList whenever photos prop changes
  useEffect(() => {
    if (selectedPhotos) {
      setPhotoList(selectedPhotos);
    }
  }, [selectedPhotos]);

  const handlePhotoAlbumSelection = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled) {
      const newFiles = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.uri.split("/").pop(),
        type: asset.type || "image/jpeg",
        description: "",
        taggedUsers: [],
      }));

      setSelectedPhotos((prevPhotos) => [...prevPhotos, ...newFiles]);
      setEditPhotosModalVisible(true);
    }
  };

  const handleSavePhotos = (updatedPhotos) => {
    setSelectedPhotos(updatedPhotos);
    setEditPhotosModalVisible(false);

    setTimeout(() => {
      setReviewModalVisible(true);
    }, 300);
  };

  // Handle review submission
  const handleSubmit = async () => {
    if (!business || (selectedTab === "review" && !review.trim())) {
      Alert.alert("Error", "Please fill in all required fields.");
      return;
    }

    try {
      let uploadedPhotos = [];

      // Upload photos if user selected any
      if (selectedPhotos.length > 0) {
        const uploadResult = await dispatch(
          uploadReviewPhotos({ placeId: business.place_id, files: selectedPhotos })
        ).unwrap();

        uploadedPhotos = uploadResult.map((photoKey, index) => ({
          photoKey,
          uploadedBy: userId,
          description: selectedPhotos[index].description || "",
          taggedUsers: selectedPhotos[index].taggedUsers
            ? selectedPhotos[index].taggedUsers.map(user => ({
              userId: user._id,  // Store only user ID
              x: user.x,          // Include x coordinate for tag positioning
              y: user.y           // Include y coordinate for tag positioning
            }))
            : [],
        }));
      }

      let postId = null;

      if (selectedTab === "review") {
        // Prepare and submit a review
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

        Alert.alert("Success", "Your review has been submitted!");
      } else {
        // Extract only Object IDs from tagged friends
        const taggedUserIds = taggedUsers.map((friend) => friend._id);

        // Prepare and submit a check-in
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

        Alert.alert("Success", "Your check-in has been posted!");
      }

      // Send notifications to tagged users in the post
      for (const taggedUser of taggedUsers) {
        console.log("📢 Sending Review/Check-in Tag Notification to:", taggedUser._id);
        await dispatch(
          createNotification({
            userId: taggedUser._id,
            type: "tag",
            message: `${fullName} tagged you in a ${selectedTab === "review" ? "review" : "check-in"}!`,
            relatedId: userId, // The user who created the post
            typeRef: "User",
            targetId: postId, // The review or check-in ID
            postType: selectedTab, 
          })
        );
      }

      // Send notifications to users tagged in photos
      for (const photo of uploadedPhotos) {
        for (const taggedUser of photo.taggedUsers) {
          console.log("📸 Sending Photo Tag Notification to:", taggedUser.userId);
          await dispatch(
            createNotification({
              userId: taggedUser.userId, 
              type: "photoTag",
              message: `${fullName} tagged you in a photo!`,
              relatedId: userId,
              typeRef: "User",
              targetId: postId,
              postType: selectedTab, 
            })
          );
        }
      }

      // Reset state after submission
      onClose();
      setBusiness(null);
      setRating(3);
      setReview("");
      setCheckInMessage("");
      setSelectedPhotos([]);
      setTaggedUsers([]);

    } catch (error) {
      Alert.alert("Error", error.message || "Failed to submit.");
    }
  };

  const handlePreviewImagePress = (photo) => {
    setPreviewPhoto(photo);
    setPhotoDetailsEditing(true);
  }

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList((prev) =>
      prev.map((photo) => (photo.uri === updatedPhoto.uri ? updatedPhoto : photo))
    );
  };

  const handleRating = (newRating = 3) => setRating(newRating);

  const renderContent = () => (
    <View style={styles.modalContainer}>
      <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
        <Text style={styles.closeIconText}>✕</Text>
      </TouchableOpacity>
      {/* Toggle Buttons */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, selectedTab === "review" && styles.activeTab]}
          onPress={() => setSelectedTab("review")}
        >
          <Text style={styles.toggleText}>Write a Review 📝</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, selectedTab === "check-in" && styles.activeTab]}
          onPress={() => setSelectedTab("check-in")}
        >
          <Text style={styles.toggleText}>Check-In 📍</Text>
        </TouchableOpacity>
      </View>

      {/* Google Places Autocomplete */}
      <GooglePlacesAutocomplete
        placeholder="Search for a business"
        ref={googlePlacesRef}
        fetchDetails={true}
        onPress={(data, details = null) => {
          if (details) {
            setBusiness(details);
            setBusinessName(details?.name);
          }
        }}
        query={{
          key: GOOGLE_API_KEY,
          language: "en",
          types: "establishment",
        }}
        styles={{
          textInputContainer: {
            width: "100%",
            marginBottom: 15,
          },
          textInput: {
            backgroundColor: "#f5f5f5",
            height: 50,
            borderRadius: 5,
            paddingHorizontal: 10,
            borderWidth: 1,
            borderColor: "#ccc",
            fontSize: 16,
          },
          listView: {
            backgroundColor: "#fff",
            borderRadius: 5,
            elevation: 2,
          },
        }}
      />

      {selectedTab === "review" ? (
        <>
          {/* Rating */}
          <Text style={styles.optionLabel}>Rating</Text>
          <View style={{ alignSelf: "flex-start" }}>
            <AirbnbRating
              count={5}
              defaultRating={rating ?? 3}
              size={20}
              onFinishRating={handleRating}
              showRating={false}
            />
          </View>

          {/* Review Text */}
          <Text style={styles.optionLabel}>Your Review</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Write your review"
            value={review}
            onChangeText={setReview}
            multiline
          />
        </>
      ) : (
        <>
          {/* Review Text */}
          <Text style={styles.optionLabel}>Check-In message (optional)</Text>
          <TextInput
            style={styles.textArea}
            value={checkInMessage}
            onChangeText={setCheckInMessage}
            multiline
          />
        </>
      )}

      {/* Selected Photos Preview */}
      {selectedPhotos.length > 0 && (
        <View style={styles.photosContainer}>
          <Text style={styles.optionLabel}>Photos</Text>
          <FlatList
            data={selectedPhotos}
            horizontal
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.photoWrapper} onPress={() => handlePreviewImagePress(item)}>
                <Image source={{ uri: item.uri }} style={styles.photoPreview} />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Tagged Users Display */}
      {taggedUsers.length > 0 && (
        <View style={styles.taggedUsersContainer}>
          <Text style={styles.optionLabel}>Tagged Friends:</Text>
          <FlatList
            data={taggedUsers}
            horizontal
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setTaggedUsers(taggedUsers.filter(u => u._id !== item._id))}>
                <View style={styles.taggedUserItem}>
                  <Image source={{ uri: item.presignedProfileUrl }} style={styles.taggedUserPic} />
                  <Text style={styles.taggedUserName}>{item.firstName}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <View style={styles.photosAndTags}>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={handlePhotoAlbumSelection}
        >
          <Text style={styles.uploadButtonText}>Add Photos 🖼️</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uploadButton} onPress={() => setTagFriendsModalVisible(true)}>
          <Text style={styles.uploadButtonText}>Tag Friends 🏷️</Text>
        </TouchableOpacity>
      </View>

      {/* Submit Button */}
      <TouchableOpacity onPress={handleSubmit} style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Post</Text>
      </TouchableOpacity>

      {/* Tag Friends Modal */}
      <TagFriendsModal
        visible={tagFriendsModalVisible}
        onSave={setTaggedUsers} // Update selected tagged users
        onClose={() => setTagFriendsModalVisible(false)}
        initialSelectedFriends={taggedUsers}
      />
      {/* Edit photos modal */}
      <EditPhotosModal
        visible={editPhotosModalVisible}
        photos={selectedPhotos}
        onSave={handleSavePhotos}
        photoList={photoList}
        setPhotoList={setPhotoList}
        onClose={() => {
          setEditPhotosModalVisible(false);
        }}
      />
      {/* Edit Photo Details Modal */}
      <EditPhotoDetailsModal
        visible={photoDetailsEditing}
        photo={previewPhoto}
        onClose={() => setPhotoDetailsEditing(false)}
        onSave={handlePhotoSave}
        setPhotoList={setPhotoList}
      />
    </View>
  );

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.keyboardAvoidingView}
          >
            <FlatList
              data={[{ key: "content" }]} // Use FlatList to render content
              renderItem={renderContent}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
            />
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
};

export default WriteReviewModal;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContainer: {
    backgroundColor: "white",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: "100%",
    alignSelf: "center",
    elevation: 10,
  },
  closeIcon: {
    position: "absolute",
    top: 15,
    right: 15,
    padding: 5,
  },
  closeIconText: {
    fontSize: 20,
    color: "#333",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  optionLabel: {
    fontSize: 16,
    marginVertical: 10,
  },
  input: {
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  textArea: {
    height: 100,
    backgroundColor: "#fff",
    borderRadius: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    textAlignVertical: "top",
    marginBottom: 10,
  },
  submitButton: {
    backgroundColor: "#2196F3",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 15,
  },
  submitButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  uploadButton: {
    backgroundColor: "#388E3C",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  photosContainer: {
    //marginTop: 10,
    marginBottom: 10,
  },
  photoWrapper: {
    marginRight: 10,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  photoPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  // Toggle Button Styling
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 15,
    marginTop: 25,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: "#e0e0e0",
    alignItems: "center",
    borderRadius: 8,
    marginHorizontal: 5,
  },
  activeTab: {
    backgroundColor: "#2196F3",
  },
  toggleText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
  },
  // Upload Button
  uploadButton: {
    backgroundColor: "teal",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  uploadButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  optionLabel: {
    fontSize: 16,
    marginVertical: 10,
  },
  photosAndTags: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  taggedUsersContainer: {
    flexDirection: "column",
    marginTop: 10,
    marginBottom: 10,
  },
  taggedUserItem: {
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    padding: 5,
  },
  taggedUserPic: {
    width: 50,
    height: 50,
    borderRadius: 25, // Circular avatar
  },
  taggedUserName: {
    fontSize: 14,
    marginTop: 5,
    color: "#333",
  },
});
