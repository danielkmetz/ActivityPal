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

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;

const WriteReviewModal = ({ visible, onClose, setReviewModalVisible, business, setBusiness, setBusinessName, businessName }) => {
  const dispatch = useDispatch();
  const [rating, setRating] = useState(3);
  const [review, setReview] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);  
  const user = useSelector(selectUser);
  const userId = user.id;
  const fullName = `${user.firstName} ${user?.lastName}`;
  const googlePlacesRef = useRef(null);

  useEffect(() => {
    if (visible && business && googlePlacesRef.current) {
      googlePlacesRef.current.setAddressText(`${business.name}, ${business.formatted_address}`);
    }
  }, [visible, business]);

  const handlePhotoAlbumSelection = async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType,
        allowsMultipleSelection: true,
        quality: 1,
      });
    
      if (!result.canceled) {
        const files = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.uri.split("/").pop(),
          type: asset.type || "image/jpeg",
          description: "",
          tags: [],
        }));
    
        setSelectedPhotos(files);
        setReviewModalVisible(false);
        setTimeout(() => {
          setEditPhotosModalVisible(true); // ✅ Open EditPhotosModal
        }, 300); // Small delay to ensure smooth transition
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
    if (!business || !review || !user) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    try {
      let uploadedPhotos = [];

      // Upload photos first if user selected them
      if (selectedPhotos.length > 0) {
        const uploadResult = await dispatch(
          uploadReviewPhotos({ placeId: business.place_id, files: selectedPhotos })
        ).unwrap();

        // Map uploaded photo keys to the correct schema format
        uploadedPhotos = uploadResult.map((photoKey, index) => ({
          photoKey,
          uploadedBy: userId, // Include the user who uploaded it
          description: selectedPhotos[index].description || "", // User-added description
          tags: selectedPhotos[index].tags || [], // User-added tags
        }));
      }

      // Prepare the review payload
      const payload = {
        placeId: business.place_id,
        businessName: business.name,
        userId,
        fullName,
        rating,
        reviewText: review,
        photos: uploadedPhotos, // Attach full photo objects
      };

      // Submit the review
      await dispatch(createReview(payload)).unwrap();

      Alert.alert("Success", "Your review has been submitted!");
      onClose();
      setBusiness(null);
      setRating(3);
      setReview("");
      setSelectedPhotos([]); // Clear selected photos
    } catch (error) {
      console.error("Error submitting review:", error);
      Alert.alert("Error", error.message || "Failed to submit review.");
    }
  };

  const renderContent = () => (
    <View style={styles.modalContainer}>
      <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
        <Text style={styles.closeIconText}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.modalTitle}>Write a Review</Text>

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

      {/* Rating */}
      <Text style={styles.optionLabel}>Rating</Text>
      <View style={{ alignSelf: "flex-start" }}>
        <AirbnbRating
          count={5}
          defaultRating={rating || 3}
          size={20}
          onFinishRating={(newRating = 3) => setRating(newRating)}
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

      {/* Selected Photos Preview */}
      {selectedPhotos.length > 0 && (
        <View style={styles.photosContainer}>
          <Text style={styles.optionLabel}>Selected Photos</Text>
          <FlatList
            data={selectedPhotos}
            horizontal
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <View style={styles.photoWrapper}>
                <Image source={{ uri: item.uri }} style={styles.photoPreview} />
              </View>
            )}
          />
        </View>
      )}

      <TouchableOpacity
        style={styles.uploadButton}
        onPress={handlePhotoAlbumSelection}
      >
        <Text style={styles.uploadButtonText}>Add Photos</Text>
      </TouchableOpacity>

      {/* Submit Button */}
      <TouchableOpacity onPress={handleSubmit} style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Submit</Text>
      </TouchableOpacity>
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
    {/* Edit photos modal */}
    <EditPhotosModal
      visible={editPhotosModalVisible}
      photos={selectedPhotos}
      onSave={handleSavePhotos}
      onClose={() => {
        setEditPhotosModalVisible(false);
      }}
    />
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
    marginBottom: 15,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "#2196F3",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
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
    marginTop: 10,
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
  
});
