import React, { useState } from "react";
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
} from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { AirbnbRating } from "react-native-ratings";
import { useDispatch } from "react-redux";
import { createReview } from "../../Slices/ReviewsSlice";
import { selectUser } from "../../Slices/UserSlice";
import { useSelector } from "react-redux";

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;

const WriteReviewModal = ({ visible, onClose }) => {
  const dispatch = useDispatch();
  const [business, setBusiness] = useState(null);
  const [businessName, setBusinessName] = useState("");
  const [rating, setRating] = useState(3);
  const [review, setReview] = useState("");
  const user = useSelector(selectUser);
  const userId = user.id;
  const fullName = `${user.firstName} ${user?.lastName}`;

  const handleSubmit = async () => {
    if (!business || !review || !user) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    try {
      const payload = {
        placeId: business.place_id,
        businessName: business.name,
        userId,
        fullName,
        rating,
        reviewText: review,
      };

      await dispatch(createReview(payload)).unwrap();
      Alert.alert("Success", "Your review has been submitted!");
      onClose();
      setBusiness(null);
      setRating(3);
      setReview("");
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
        fetchDetails={true}
        onPress={(data, details = null) => {
          if (details) {
            setBusiness(details);
            setBusinessName(details.name);
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
          defaultRating={rating}
          size={20}
          onFinishRating={setRating}
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

      {/* Submit Button */}
      <TouchableOpacity onPress={handleSubmit} style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Submit</Text>
      </TouchableOpacity>
    </View>
  );

  return (
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
});
