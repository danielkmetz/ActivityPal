import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import {
  fetchEvents,
  selectEvents,
  selectLoading as selectEventsLoading,
  deleteEvent,
} from "../../Slices/EventsSlice";
import {
  fetchPromotions,
  selectPromotions,
  deletePromotion,
  selectLoading as selectPromotionsLoading,
} from "../../Slices/PromotionsSlice";
import CreateEventModal from "./CreateEventModal";
import CreatePromotionModal from "./CreatePromotionModal";
import PhotoItem from "../Reviews/PhotoItem";
import PhotoPaginationDots from '../Reviews/PhotoPaginationDots';

const MyEventsPage = () => {
  const dispatch = useDispatch();
  const [selectedTab, setSelectedTab] = useState("events"); // Toggle state for Events & Promotions
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null); // Event or promotion being edited
  const [dropdownVisible, setDropdownVisible] = useState(null);
  const user = useSelector(selectUser);
  const events = useSelector(selectEvents);
  const promotions = useSelector(selectPromotions) || [];
  const eventsLoading = useSelector(selectEventsLoading);
  const promotionsLoading = useSelector(selectPromotionsLoading);
  const placeId = user?.businessDetails?.placeId;
  const scrollX = useRef(new Animated.Value(0)).current;

  // Fetch data on component mount
  useEffect(() => {
    if (placeId) {
      dispatch(fetchEvents(placeId));
      dispatch(fetchPromotions(placeId));
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

  const handleEdit = (item) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setSelectedItem(null);
  };

  const handleCreateItem = () => {
    setSelectedItem(null);
    setModalVisible(true);
  };

  const toggleDropdown = (itemId) => {
    setDropdownVisible(dropdownVisible === itemId ? null : itemId);
  };

  const handleDelete = async (item) => {
    const isEvent = selectedTab === "events";
    const itemType = isEvent ? "event" : "promotion";

    Alert.alert(
      `Confirm Deletion`,
      `Are you sure you want to delete this ${itemType}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (isEvent) {
                await dispatch(deleteEvent({ placeId, eventId: item._id })).unwrap();
              } else {
                await dispatch(deletePromotion({ placeId, promotionId: item._id })).unwrap();
              }

              Alert.alert("Success", `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} deleted successfully!`);
            } catch (error) {
              console.error(`Error deleting ${itemType}:`, error);
              Alert.alert("Error", error?.message || `Failed to delete ${itemType}.`);
            }
          },
        },
      ]
    );
  };

  const isEventsTab = selectedTab === "events";
  const data = isEventsTab ? events : promotions;
  const loading = isEventsTab ? eventsLoading : promotionsLoading;

  return (
    <View style={styles.container}>
      {/* Toggle Buttons */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, isEventsTab && styles.activeButton]}
          onPress={() => setSelectedTab("events")}
        >
          <Text style={[styles.toggleText, isEventsTab && styles.activeText]}>
            Events
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleButton, !isEventsTab && styles.activeButton]}
          onPress={() => setSelectedTab("promotions")}
        >
          <Text style={[styles.toggleText, !isEventsTab && styles.activeText]}>
            Promotions
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              {/* Three-dot menu */}
              <View style={styles.menuContainer}>
                <TouchableOpacity onPress={() => toggleDropdown(item._id)}>
                  <Text style={styles.menuDots}>⋮</Text>
                </TouchableOpacity>

                {/* Dropdown Menu */}
                {dropdownVisible === item._id && (
                  <View style={styles.dropdownMenu}>
                    <TouchableOpacity
                      style={[styles.dropdownItem, styles.editButton]}
                      onPress={() => handleEdit(item)}
                    >
                      <Text style={styles.dropdownText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, styles.deleteButton]}
                      onPress={() => handleDelete(item)}
                    >
                      <Text style={styles.dropdownText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={styles.itemInfo}>
                <View style={styles.descriptionAndDate}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {selectedTab === "promotions" ? (
                    <>
                      <Text style={styles.itemDate}>
                        Starts: {formatDate(item.startDate)}
                      </Text>
                      <Text style={styles.promoItem}>
                        Ends: {formatDate(item.endDate)}
                      </Text>
                      {item.recurring && item.recurringDays.length > 0 && (
                        <Text style={styles.recurring}>
                          Every: {item.recurringDays.join(", ")}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.itemDate}>
                      {item.recurringDays.length > 0 ? (
                        <Text>Every {item.recurringDays.join(', ')}</Text>
                      ) : (
                        <Text>Date: {formatDate(item.date)}</Text>
                      )}
                    </Text>
                  )}

                  <Text style={styles.itemDate}>{item.description}</Text>
                </View>

                {item.photos.length > 0 && (
                  <>
                    <FlatList
                      data={item.photos}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(photo, index) => index.toString()}
                      scrollEnabled={item.photos.length > 1}
                      onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                        { useNativeDriver: false } // Native driver is false since we animate layout properties
                      )}
                      scrollEventThrottle={16}

                      renderItem={({ item: photo }) => (
                        <PhotoItem
                          photo={photo}
                          reviewItem={item} // can rename if not actually a review
                          likedAnimations={{}} // or pass in your real likedAnimations object
                          photoTapped={null} // pass in correct value if needed
                          toggleTaggedUsers={() => { }} // no-op unless you need tag functionality
                          handleLikeWithAnimation={() => { }} // no-op unless using like animation
                        />
                      )}
                      style={{ width: Dimensions.get('window').width, marginTop: -10, }}
                    />
                    <PhotoPaginationDots photos={item.photos} scrollX={scrollX} />

                  </>
                )}
              </View>

            </View>
          )}
        />
      )}

      {/* Create Button */}
      <TouchableOpacity style={styles.createButton} onPress={handleCreateItem}>
        <Text style={styles.createButtonText}>
          {isEventsTab ? "Create New Event" : "Create New Promotion"}
        </Text>
      </TouchableOpacity>

      {/* Create/Edit Modal */}
      {isEventsTab ? (
        <CreateEventModal
          visible={modalVisible}
          onClose={handleModalClose}
          businessId={placeId}
          onEventCreated={() => dispatch(fetchEvents(placeId))}
          event={selectedItem}
        />
      ) : (
        <CreatePromotionModal
          visible={modalVisible}
          onClose={handleModalClose}
          placeId={placeId}
          onPromotionCreated={() => dispatch(fetchPromotions(placeId))}
          promotion={selectedItem}
        />
      )}
    </View>
  );
};

export default MyEventsPage;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    marginTop: 130,
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
  },
  toggleButton: {
    flex: 1,
    padding: 12,
    backgroundColor: "#ccc",
    alignItems: "center",
    borderRadius: 5,
    marginHorizontal: 5,
  },
  activeButton: {
    backgroundColor: "#33cccc",
  },
  toggleText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  activeText: {
    color: "white",
  },
  itemCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 10,
    elevation: 2,
    position: 'relative',
    paddingBottom: 20,
  },
  descriptionAndDate: {
    padding: 15,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  itemDate: {
    fontSize: 14,
    color: "#555",
    marginTop: 5,
  },
  promoItem: {
    fontSize: 14,
    color: "#555",
  },
  recurring: {
    fontSize: 14,
    color: "#555",
    marginTop: 10,
  },
  menuContainer: {
    position: "absolute", // ✅ Position it absolutely
    top: 20,
    right: 10,
    zIndex: 10, // ✅ Ensure it stays above everything else
  },
  menuDots: {
    fontSize: 30,
    color: "#555",
    paddingHorizontal: 10,
  },
  dropdownMenu: {
    position: "absolute",
    top: 30,
    right: 0,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 10,
    elevation: 20,
    minWidth: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    zIndex: 9999,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginBottom: 5,
    alignItems: "center",
  },
  editButton: {
    backgroundColor: "gray",
  },
  deleteButton: {
    backgroundColor: "#ff5050",
  },
  dropdownText: {
    fontSize: 16,
    color: "white",
    fontWeight: "bold",
  },
  createButton: {
    backgroundColor: "#33cccc",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  createButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});



