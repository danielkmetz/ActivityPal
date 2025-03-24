import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Switch,
  ScrollView,
  Alert,
  Platform,
  TouchableWithoutFeedback,
  Image,
} from "react-native";
import { createEvent, editEvent, deleteEvent } from "../../Slices/EventsSlice";
import { useDispatch } from "react-redux";
import { GestureHandlerRootView, PanGestureHandler } from "react-native-gesture-handler";
import EditPhotosModal from "../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../Profile/EditPhotoDetailsModal";
import * as ImagePicker from "expo-image-picker";
import { uploadReviewPhotos } from "../../Slices/PhotosSlice";
import RecurringDaysModal from "./RecurringDaysModal";
import DateTimePicker from "@react-native-community/datetimepicker";

const CreateEventModal = ({ visible, onClose, businessId, onEventCreated, event }) => {
  const dispatch = useDispatch();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
  const [photoList, setPhotoList] = useState([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState([]);
  const [recurringDaysModalVisible, setRecurringDaysModalVisible] = useState(false);

  useEffect(() => {
    if (event) {
      // Pre-populate fields when editing an event
      setTitle(event.title || "");
      setDate(event.date || "");
      setDescription(event.description || "");
      setIsRecurring(event.recurring || false);
      setSelectedDays(event.recurringDays || []);
    } else {
      // Clear fields when creating a new event
      setTitle("");
      setDate("");
      setDescription("");
      setIsRecurring(false);
      setSelectedDays([]);
    }
  }, [event, visible]); // Reset fields when event or modal visibility changes

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
  };

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList((prev) =>
      prev.map((photo) => (photo.uri === updatedPhoto.uri ? updatedPhoto : photo))
    );
  };

  const handlePreviewImagePress = (photo) => {
    setPreviewPhoto(photo);
    setPhotoDetailsEditing(true);
  };

  // Open the Recurring Days Modal
  const handleRecurringToggle = (value) => {
    setIsRecurring(value);
    if (value) {
      setRecurringDaysModalVisible(true);
    }
  };

  // Save Recurring Days
  const handleSaveRecurringDays = (days) => {
    setSelectedDays(days);
    setRecurringDaysModalVisible(false);
  };

  const handleCloseRecurringModal = () => {
    setRecurringDaysModalVisible(false);

    if (selectedDays.length === 0) {
      setIsRecurring(false); // Reset recurring toggle if no days are selected
    }
  };

  const onDateChange = (event, selectedDate) => {
    if (selectedDate) {
      setDate(selectedDate);
    };
  };

  const handleSubmit = async () => {
    if (!title || !description) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    };

    let uploadedPhotos = [];

    // Upload photos if user selected any
    try {
      if (selectedPhotos.length > 0) {
        const uploadResult = await dispatch(uploadReviewPhotos({ placeId: businessId, files: selectedPhotos })).unwrap();
        uploadedPhotos = uploadResult.map((photoKey, index) => ({
          photoKey,
          uploadedBy: businessId,
          description: selectedPhotos[index]?.description || "",
        }));
      }
    } catch (error) {
      console.error("Photo upload failed:", error);
      Alert.alert("Error", "Failed to upload photos.");
      return;
    }

    console.log(uploadedPhotos);

    try {
      if (event) {
        // Editing an existing event
        await dispatch(
          editEvent({
            placeId: businessId,
            eventId: event._id, // Use the event's ID for editing
            title,
            date,
            description,
            photos: uploadedPhotos,
            recurring: isRecurring,
            recurringDays: selectedDays,
          })
        ).unwrap();
        Alert.alert("Success", "Event updated successfully!");
      } else {
        // Creating a new event
        await dispatch(
          createEvent({
            placeId: businessId,
            title,
            date,
            description,
            photos: uploadedPhotos,
            recurring: isRecurring,
            recurringDays: selectedDays
          })
        ).unwrap();
        Alert.alert("Success", "Event created successfully!");
      }
      setSelectedPhotos([]);

      onEventCreated && onEventCreated(); // Refresh events
      onClose(); // Close modal
    } catch (error) {
      console.error("Error saving event:", error);
      Alert.alert("Error", error || "Failed to save event.");
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      "Confirm Deletion",
      "Are you sure you want to delete this event?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await dispatch(
                deleteEvent({
                  placeId: businessId,
                  eventId: event._id, // Use the event's ID for deletion
                })
              ).unwrap();
              Alert.alert("Success", "Event deleted successfully!");
              onEventCreated && onEventCreated(); // Refresh events
              onClose(); // Close modal
            } catch (error) {
              console.error("Error deleting event:", error);
              Alert.alert("Error", error || "Failed to delete event.");
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={Platform.OS === "ios" ? -150 : 0}
              style={styles.modalContainer}
            >
              <PanGestureHandler
                onGestureEvent={(event) => {
                  if (event.nativeEvent.translationY > 50) {
                    onClose();
                  }
                }}
              >
                <View style={styles.modalContent}>
                  <TouchableWithoutFeedback onPress={() => { }}>
                    <View style={{ width: "100%" }}>
                      {/* Swipe-down notch */}
                      <View style={styles.notchContainer}>
                        <View style={styles.notch} />
                      </View>
                      <Text style={styles.modalTitle}>
                        {event ? "Edit Event" : "Create New Event"}
                      </Text>

                      <Text style={styles.optionLabel}>Event Title</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter event title"
                        value={title}
                        onChangeText={setTitle}
                      />

                      <Text style={styles.optionLabel}>Event Description</Text>
                      <TextInput
                        style={styles.textArea}
                        placeholder="Enter event description"
                        value={description}
                        onChangeText={setDescription}
                        multiline
                      />

                      {!isRecurring && (
                        <View style={styles.dateInput}>
                          <Text style={styles.label}>Event Date</Text>
                          <DateTimePicker
                            value={date || new Date()}
                            mode="date"
                            display="default"
                            onChange={onDateChange}
                          />
                        </View>
                      )}

                      <View style={styles.toggleContainer}>
                        <Text style={styles.toggleLabel}>Make Recurring</Text>
                        <Switch
                          value={isRecurring}
                          onValueChange={handleRecurringToggle}
                          thumbColor={isRecurring ? "#FFFFFF" : "#f4f3f4"}
                          trackColor={{ false: "#ccc", true: "#4CAF50" }} // Gray when OFF, Green when ON
                        />
                      </View>

                      {isRecurring && (
                        <Text style={styles.selectedDaysText}>Repeats on: {selectedDays.join(", ")}</Text>
                      )}

                      {/* Render photo previews */}
                      <ScrollView horizontal style={styles.photoContainer}>
                        {photoList.map((photo, index) => (
                          <TouchableOpacity key={index} onPress={() => handlePreviewImagePress(photo)}>
                            <Image source={{ uri: photo.uri }} style={styles.imagePreview} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      {/* Promotional Photo Upload */}
                      <TouchableOpacity style={styles.uploadButton} onPress={handlePhotoAlbumSelection}>
                        <Text style={styles.uploadButtonText}>Add Event Photos</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={handleSubmit} style={styles.submitButton}>
                        <Text style={styles.submitButtonText}>
                          {event ? "Save Changes" : "Create Event"}
                        </Text>
                      </TouchableOpacity>

                      {event && (
                        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
                          <Text style={styles.deleteButtonText}>Delete Event</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableWithoutFeedback>
                </View>
              </PanGestureHandler>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </GestureHandlerRootView>

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
        isPromotion={true}
      />

      {/* Edit Photo Details Modal */}
      <EditPhotoDetailsModal
        visible={photoDetailsEditing}
        photo={previewPhoto}
        onClose={() => setPhotoDetailsEditing(false)}
        onSave={handlePhotoSave}
        setPhotoList={setPhotoList}
        isPromotion={true}
      />

      <RecurringDaysModal
        visible={recurringDaysModalVisible}
        selectedDays={selectedDays}
        onSave={handleSaveRecurringDays}
        onClose={handleCloseRecurringModal}
      />
    </Modal>
  );
};

export default CreateEventModal;

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
    elevation: 10,
  },
  scrollContent: {
    flexGrow: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
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
  optionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
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
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#ccc",
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "#2196F3",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 20,
  },
  submitButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  deleteButton: {
    backgroundColor: "#FF4136",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  deleteButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  photoContainer: {
    marginVertical: 10,
    flexDirection: "row",
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
    marginRight: 10,
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 10,
    marginVertical: 10,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  selectedDaysText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    textAlign: "left",
  },
  uploadButton: {
    backgroundColor: "#FFA500",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  uploadButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
    marginBottom: 10,
  },
  dateText: {
    fontSize: 16,
    color: "#000",
    fontWeight: '500'
  },
  notchContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  notch: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#ccc",
  },
});
