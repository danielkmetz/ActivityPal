import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { selectUser } from "../../Slices/UserSlice";
import { fetchEvents, selectEvents, selectLoading } from "../../Slices/EventsSlice";
import { useSelector, useDispatch } from "react-redux";
import CreateEventModal from "./CreateEventModal";

const MyEventsPage = () => {
  const dispatch = useDispatch();
  const [modalVisible, setModalVisible] = useState(false); // Modal visibility state
  const [selectedEvent, setSelectedEvent] = useState(null); // Event being edited
  const user = useSelector(selectUser);
  const events = useSelector(selectEvents);
  const loading = useSelector(selectLoading);
  const placeId = user?.businessDetails?.placeId;

  // Fetch events on component mount
  useEffect(() => {
    if (placeId) {
      dispatch(fetchEvents(placeId));
    }
  }, [placeId]);

  const formatDate = (isoDate) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleEdit = (event) => {
    setSelectedEvent(event); // Set the event to edit
    setModalVisible(true); // Open the modal
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setSelectedEvent(null); // Clear the selected event
  };

  const handleCreateEvent = () => {
    setSelectedEvent(null); // Ensure no event is selected
    setModalVisible(true); // Open the modal for creating a new event
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Events</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.eventCard}>
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <Text style={styles.eventDate}>Date: {formatDate(item.date)}</Text>
              </View>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => handleEdit(item)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Create Event Button */}
      <TouchableOpacity
        style={styles.createEventButton}
        onPress={handleCreateEvent}
      >
        <Text style={styles.createEventButtonText}>Create New Event</Text>
      </TouchableOpacity>

      {/* Create/Edit Event Modal */}
      <CreateEventModal
        visible={modalVisible}
        onClose={handleModalClose}
        businessId={placeId}
        onEventCreated={() => dispatch(fetchEvents(placeId))} // Refresh events after creating or editing
        event={selectedEvent} // Pass the selected event to pre-populate the modal
      />
    </View>
  );
};

export default MyEventsPage;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
    marginTop: 150,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  eventCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 5,
    marginBottom: 10,
    elevation: 2,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  eventDate: {
    fontSize: 14,
    color: "#555",
  },
  editButton: {
    backgroundColor: "#FFA500",
    padding: 10,
    borderRadius: 5,
  },
  editButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  createEventButton: {
    backgroundColor: "#2196F3",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  createEventButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});
