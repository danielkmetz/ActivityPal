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
  Keyboard,
} from "react-native";
import Animated from "react-native-reanimated";
import { createEvent, editEvent } from "../../Slices/EventsSlice";
import { useDispatch } from "react-redux";
import { GestureDetector } from "react-native-gesture-handler";
import EditPhotosModal from "../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../Profile/EditPhotoDetailsModal";
import * as ImagePicker from "expo-image-picker";
import { uploadReviewPhotos } from "../../Slices/PhotosSlice";
import RecurringDaysModal from "./RecurringDaysModal";
import DateTimePicker from "@react-native-community/datetimepicker";
import useSlideDownDismiss from "../../utils/useSlideDown";
import { normalizePhoto } from "../../functions";
import Notch from "../Notch/Notch";

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
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  const [startDate, setStartDate] = useState(new Date());
  const placeId = businessId;

  useEffect(() => {
    if (event) {
      // Pre-populate fields when editing an event
      setTitle(event.title || "");
      setDate(event.date || "");
      setDescription(event.description || "");
      setIsRecurring(event.recurring || false);
      setSelectedDays(event.recurringDays || []);
      setAllDay(event.allDay ?? true);

      const normalized = (event.photos || []).map(normalizePhoto);
      setPhotoList(normalized);
      setSelectedPhotos(normalized);
      setStartTime(event.startTime ? new Date(event.startTime) : new Date());
      setEndTime(event.endTime ? new Date(event.endTime) : new Date());
    } else {
      // Clear fields when creating a new event
      setTitle("");
      setDate("");
      setDescription("");
      setIsRecurring(false);
      setSelectedDays([]);
      setStartTime(new Date());
      setEndTime(new Date());
      setPhotoList([]);
      setSelectedPhotos([]);
      setAllDay(true)
    }
  }, [event, visible]); // Reset fields when event or modal visibility changes

  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

  useEffect(() => {
    if (visible) {
      animateIn();            // Animate it in
    } else {
      // Animate it out and hide the modal
      (async () => {
        await animateOut();
        onClose();
      })();
    }
  }, [visible]);

  const handleSavePhotos = (updatedPhotos) => {
    setSelectedPhotos(updatedPhotos);
    setEditPhotosModalVisible(false);
  };

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList((prev) =>
      prev.map((photo) => (photo.uri === updatedPhoto.uri ? updatedPhoto : photo))
    );
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

  const handleSubmit = async () => {
    if (!title || !description) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    };

    let uploadedPhotos = [];

    try {
      // ✅ Filter out only local photos with a valid `uri` that starts with "file:"
      const newPhotosToUpload = selectedPhotos.filter(
        (p) => p.uri && p.uri.startsWith("file:") && !p.photoKey
      );

      if (newPhotosToUpload.length > 0) {
        const uploadResult = await dispatch(
          uploadReviewPhotos({ placeId, files: newPhotosToUpload })
        ).unwrap();

        uploadedPhotos = uploadResult.map((photoKey, index) => ({
          photoKey,
          uploadedBy: placeId,
          description: newPhotosToUpload[index]?.description || "",
        }));
      }

      // ✅ Preserve existing uploaded photos
      const existingPhotos = selectedPhotos.filter((p) => p.photoKey && p.url);
      uploadedPhotos = [...uploadedPhotos, ...existingPhotos];
    } catch (error) {
      console.error("Photo upload failed:", error);
      Alert.alert("Error", "Failed to upload photos.");
      return;
    }

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
            allDay,
            startTime,
            endTime,
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
            allDay,
            recurring: isRecurring,
            recurringDays: selectedDays,
            startTime,
            endTime,
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <TouchableWithoutFeedback onPress={animateOut}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={Platform.OS === "ios" ? -150 : 0}
              style={styles.modalContainer}
            >
              <GestureDetector
                gesture={gesture}
              >
                <Animated.View style={[styles.modalContent, animatedStyle]}>
                  <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={{ width: "100%" }}>
                      <Notch />
                      <Text style={styles.modalTitle}>
                        {event ? "Edit Event" : "Create New Event"}
                      </Text>

                      <View style={styles.inputContainer}>
                        <Text style={styles.label}>Title</Text>
                        <TextInput style={styles.input} value={title} onChangeText={setTitle} />
                      </View>

                      <View style={styles.inputContainer}>
                        <Text style={styles.label}>Description</Text>
                        <TextInput
                          style={[styles.input, styles.textArea]}
                          value={description}
                          onChangeText={setDescription}
                          multiline
                        />
                      </View>

                      {!isRecurring && (
                        <View style={styles.toggleContainer}>
                          <Text style={styles.toggleLabel}>Event date</Text>
                          <DateTimePicker
                            value={startDate || new Date()}
                            mode="date"
                            display="default"
                            onChange={(e, d) => setStartDate(d)}
                          />
                        </View>
                      )}

                      <View style={styles.toggleRow}>
                        <View style={styles.toggleItem}>
                          <Text style={styles.toggleLabel}>All Day?</Text>
                          <Switch value={allDay} onValueChange={setAllDay} trackColor={{ false: "#ccc", true: "#2196F3" }} />
                        </View>

                        <View style={styles.toggleItem}>
                          <Text style={styles.toggleLabel}>Recurring</Text>
                          <Switch
                            value={isRecurring}
                            trackColor={{ false: "#ccc", true: "#2196F3" }}
                            onValueChange={(value) => {
                              setIsRecurring(value);
                              if (value) setRecurringDaysModalVisible(true);
                            }}
                          />
                        </View>
                      </View>

                      {!allDay && (
                        <>
                          <View style={styles.dateInput}>
                            <View>
                              <Text style={styles.dateLabel}>Start Time</Text>
                              <DateTimePicker value={startTime} mode="time" display="default" onChange={(e, t) => { setStartTime(t); }} />
                            </View>
                            <View>
                              <Text style={styles.dateLabel}>End Time</Text>
                              <DateTimePicker value={endTime} mode="time" display="default" onChange={(e, t) => { setEndTime(t); }} />
                            </View>
                          </View>
                        </>
                      )}

                      {isRecurring && (
                        <Text style={styles.selectedDaysText}>Recurs every: {selectedDays.join(", ")}</Text>
                      )}

                      <ScrollView horizontal style={styles.photoContainer}>
                        {photoList.map((photo, index) => (
                          <TouchableOpacity key={index} onPress={() => { setPreviewPhoto(photo); setPhotoDetailsEditing(true); }}>
                            <Image source={{ uri: photo.uri }} style={styles.imagePreview} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      <TouchableOpacity style={styles.uploadButton} onPress={async () => {
                        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaType, allowsMultipleSelection: true, quality: 1 });
                        if (!result.canceled) {
                          const newFiles = result.assets.map(asset => ({ uri: asset.uri, name: asset.uri.split("/").pop(), type: asset.type || "image/jpeg", description: "", taggedUsers: [] }));
                          setSelectedPhotos(prev => [...prev, ...newFiles]);
                          setEditPhotosModalVisible(true);
                        }
                      }}>
                        <Text style={styles.uploadButtonText}>Add Promotional Photo</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={handleSubmit} style={styles.saveButton}>
                        <Text style={styles.saveButtonText}>
                          {event ? "Save Changes" : "Create Event"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableWithoutFeedback>
                </Animated.View>
              </GestureDetector>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      
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
        setSelectedPhotos={setSelectedPhotos}
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
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContainer: {
    width: "100%",
  },
  modalContent: {
    width: "100%",
    backgroundColor: "white",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: "flex-start",
    flexDirection: "column",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    alignSelf: "center",
  },
  inputContainer: {
    width: "100%",
    marginBottom: 12,
    flexDirection: "column",
  },
  input: {
    width: "100%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 10,
    marginVertical: 10,
    width: "100%",
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    width: "100%",
    padding: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
    marginBottom: 5,
  },
  dateLabel: {
    fontWeight: 'bold',
    alignSelf: 'center'
  },
  dateText: {
    fontSize: 16,
    color: "#000",
    fontWeight: "500",
    marginTop: 4,
  },
  selectedDaysText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    textAlign: "left",
    width: "100%",
  },
  uploadButton: {
    backgroundColor: "#008080",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
    width: "100%",
  },
  uploadButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  photoContainer: {
    marginVertical: 10,
    flexDirection: "row",
    width: "100%",
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
    marginRight: 10,
  },
  saveButton: {
    backgroundColor: "#2196F3",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    width: "100%",
    marginVertical: 10,
  },
  saveButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  dateLabel: {
    fontWeight: 'bold',
    alignSelf: 'center'
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 10,
    marginVertical: 10,
    width: '100%',
    flexWrap: 'wrap', // in case screen is small
  },
  toggleItem: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 5,
  },
});

