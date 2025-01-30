import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
} from "react-native";
import { createEvent, editEvent, deleteEvent } from "../../Slices/EventsSlice";
import { useDispatch } from "react-redux";

const CreateEventModal = ({ visible, onClose, businessId, onEventCreated, event }) => {
  const dispatch = useDispatch();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (event) {
      // Pre-populate fields when editing an event
      setTitle(event.title || "");
      setDate(event.date || "");
      setDescription(event.description || "");
    } else {
      // Clear fields when creating a new event
      setTitle("");
      setDate("");
      setDescription("");
    }
  }, [event, visible]); // Reset fields when event or modal visibility changes

  const handleSubmit = async () => {
    if (!title || !date || !description) {
      Alert.alert("Error", "Please fill in all fields.");
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
          })
        ).unwrap();
        Alert.alert("Success", "Event updated successfully!");
      } else {
        // Creating a new event
        await dispatch(
          createEvent({ placeId: businessId, title, date, description })
        ).unwrap();
        Alert.alert("Success", "Event created successfully!");
      }

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
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
            <Text style={styles.closeIconText}>✕</Text>
          </TouchableOpacity>

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

          <Text style={styles.optionLabel}>Event Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter event date"
            value={date}
            onChangeText={setDate}
          />

          <Text style={styles.optionLabel}>Event Description</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Enter event description"
            value={description}
            onChangeText={setDescription}
            multiline
          />

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
      </View>
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
    marginTop: 20,
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
});
