import React, { useEffect, useState } from "react";
import {
  View,
  Text,
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
import { createEvent, editEvent } from "../../Slices/EventsSlice";
import { useDispatch } from "react-redux";
import EditPhotosModal from "../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../Profile/EditPhotoDetailsModal";
import * as ImagePicker from "expo-image-picker";
import { uploadReviewPhotos } from "../../Slices/PhotosSlice";
import RecurringDaysModal from "./RecurringDaysModal";
import DateTimePicker from "@react-native-community/datetimepicker";
import { normalizePhoto } from "../../functions";
import { useNavigation, useRoute } from "@react-navigation/native";

const CreateEventPage = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();
  const { businessId, onEventCreated, event } = route.params;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
  const [photoList, setPhotoList] = useState([]);
  const [isRecurring, setIsRecurring] = useState(true);
  const [selectedDays, setSelectedDays] = useState([]);
  const [recurringDaysModalVisible, setRecurringDaysModalVisible] = useState(false);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  const [startDate, setStartDate] = useState(new Date());
  const placeId = businessId;

  useEffect(() => {
    if (event) {
      setTitle(event.title || "");
      setDescription(event.description || "");
      setIsRecurring(event.recurring !== false);
      setSelectedDays(event.recurringDays || []);
      setAllDay(event.allDay ?? true);
      setStartDate(event.startDate ? new Date(event.startDate) : new Date());

      const normalized = (event.photos || []).map(normalizePhoto);
      setPhotoList(normalized);
      setSelectedPhotos(normalized);
      setStartTime(event.startTime ? new Date(event.startTime) : new Date());
      setEndTime(event.endTime ? new Date(event.endTime) : new Date());
    }
  }, [event]);

  const handleSavePhotos = (updatedPhotos) => {
    setSelectedPhotos(updatedPhotos);
    setEditPhotosModalVisible(false);
  };

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList((prev) =>
      prev.map((photo) => (photo.uri === updatedPhoto.uri ? updatedPhoto : photo))
    );
  };

  const handleSaveRecurringDays = (days) => {
    setSelectedDays(days);
    setRecurringDaysModalVisible(false);
  };

  const handleCloseRecurringModal = () => {
    setRecurringDaysModalVisible(false);
    if (selectedDays.length === 0) setIsRecurring(false);
  };

  const handleSubmit = async () => {
    if (!title || !description) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    let uploadedPhotos = [];
    try {
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

      const existingPhotos = selectedPhotos.filter((p) => p.photoKey && p.url);
      uploadedPhotos = [...uploadedPhotos, ...existingPhotos];
    } catch (error) {
      console.error("Photo upload failed:", error);
      Alert.alert("Error", "Failed to upload photos.");
      return;
    }

    try {
      if (event) {
        await dispatch(
          editEvent({
            placeId,
            eventId: event._id,
            title,
            description,
            photos: uploadedPhotos,
            allDay,
            recurring: isRecurring,
            recurringDays: selectedDays,
            startTime,
            endTime,
            startDate,
          })
        ).unwrap();
        Alert.alert("Success", "Event updated successfully!");
      } else {
        await dispatch(
          createEvent({
            placeId,
            title,
            description,
            photos: uploadedPhotos,
            allDay,
            recurring: isRecurring,
            recurringDays: selectedDays,
            startTime: startTime,
            endTime: endTime,
            startDate: startDate,
          })
        ).unwrap();
        Alert.alert("Success", "Event created successfully!");
      }
      navigation.goBack();
      onEventCreated && onEventCreated();
    } catch (error) {
      console.error("Error saving event:", error);
      Alert.alert("Error", error?.message || "Failed to save event.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? -150 : 0}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <Text style={styles.sectionTitle}>When</Text>
            {!isRecurring && (
              <View style={styles.dateInput}>
                <Text style={[styles.label, { marginRight: 20 }]}>Event Date</Text>
                <DateTimePicker
                  value={startDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(e, d) => setStartDate(d)}
                />
              </View>
            )}

            <View style={styles.toggleRow}>
              <Text style={styles.label}>Single Day Event</Text>
              <Switch
                value={!isRecurring}
                onValueChange={(value) => {
                  const newRecurring = !value;
                  setIsRecurring(newRecurring);
                  if (newRecurring) {
                    setRecurringDaysModalVisible(true);
                  } else {
                    setSelectedDays([]);
                  }
                }}
              />
            </View>
            {isRecurring && (
              <Text style={styles.selectedDaysText}>Recurs every: {selectedDays.join(", ")}</Text>
            )}

            <Text style={styles.sectionTitle}>Time</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.label}>All Day</Text>
              <Switch value={allDay} onValueChange={setAllDay} />
            </View>

            {!allDay && (
              <View style={styles.dateRow}>
                <View style={styles.timeInput}>
                  <Text style={styles.label}>Start Time</Text>
                  <DateTimePicker value={startTime} mode="time" onChange={(e, t) => setStartTime(t)} />
                </View>
                <View style={[styles.timeInput, { marginTop: 10 }]}>
                  <Text style={styles.label}>End Time</Text>
                  <DateTimePicker value={endTime} mode="time" onChange={(e, t) => setEndTime(t)} />
                </View>
              </View>
            )}
            <ScrollView horizontal style={styles.photoRow}>
              {photoList.map((photo, idx) => (
                <TouchableOpacity key={idx} onPress={() => { setPreviewPhoto(photo); setPhotoDetailsEditing(true); }}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.button} onPress={async () => {
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaType, allowsMultipleSelection: true, quality: 1 });
              if (!result.canceled) {
                const newFiles = result.assets.map(asset => ({ uri: asset.uri, name: asset.uri.split("/").pop(), type: asset.type || "image/jpeg", description: "", taggedUsers: [] }));
                setSelectedPhotos(prev => [...prev, ...newFiles]);
                setEditPhotosModalVisible(true);
              }
            }}>
              <Text style={styles.buttonText}>Add Promotional Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSubmit} style={[styles.button, { backgroundColor: '#2196F3' }]}>
              <Text style={styles.buttonText}>{event ? "Save Changes" : "Create Event"}</Text>
            </TouchableOpacity>
          </View>

          <EditPhotosModal
            visible={editPhotosModalVisible}
            photos={selectedPhotos}
            onSave={handleSavePhotos}
            photoList={photoList}
            setPhotoList={setPhotoList}
            onClose={() => setEditPhotosModalVisible(false)}
            isPromotion={true}
          />

          {previewPhoto && (
            <EditPhotoDetailsModal
              visible={photoDetailsEditing}
              photo={previewPhoto}
              onClose={() => setPhotoDetailsEditing(false)}
              onSave={handlePhotoSave}
              setPhotoList={setPhotoList}
              setSelectedPhotos={setSelectedPhotos}
              isPromotion={true}
            />
          )}

          <RecurringDaysModal
            visible={recurringDaysModalVisible}
            selectedDays={selectedDays}
            onSave={handleSaveRecurringDays}
            onClose={handleCloseRecurringModal}
          />
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

export default CreateEventPage;

const styles = StyleSheet.create({
  container: { flex: 1, marginTop: 120, marginBottom: 40 },
  content: { padding: 16 },
  title: { fontSize: 20, fontWeight: "bold", textAlign: "center", marginBottom: 12 },
  inputGroup: { gap: 12 },
  dateInput: { flexDirection: 'row', alignItems: 'center' },
  input: { borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 10, backgroundColor: "#F5F5F5" },
  textArea: { height: 80, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: '50%' },
  dateRow: { flexDirection: "column" },
  timeInput: { justifyContent: 'space-between', flexDirection: 'row', width: '50%', alignItems: 'center' },
  selectedDaysText: { marginTop: 8, fontWeight: 600 },
  photoRow: { flexDirection: "row", marginTop: 10 },
  photo: { width: 80, height: 80, borderRadius: 10, marginRight: 10 },
  button: { backgroundColor: "#008080", padding: 12, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "bold" },
  label: { fontWeight: "600" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginVertical: 10, borderBottomWidth: 1, borderColor: '#ccc', paddingBottom: 4 }
});
