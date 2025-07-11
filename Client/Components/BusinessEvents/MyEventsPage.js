import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Dimensions,
  Animated,
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import { fetchEvents, selectEvents, deleteEvent, fetchEventById } from "../../Slices/EventsSlice";
import {
  fetchPromotions,
  selectPromotions,
  deletePromotion,
  fetchPromotionById,
} from "../../Slices/PromotionsSlice";
import PhotoItem from "../Reviews/PhotoItem";
import PhotoPaginationDots from '../Reviews/PhotoPaginationDots';
import EventDetailsCard from "./EventDetailsCard";
import { useNavigation } from "@react-navigation/native";
import PostActions from "../Reviews/PostActions";
import { eventPromoLikeWithAnimation } from "../../utils/LikeHandlers/promoEventLikes";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const MyEventsPage = ({ scrollY, onScroll, customHeaderTranslateY }) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const [selectedTab, setSelectedTab] = useState("events"); // Toggle state for Events & Promotions
  const [dropdownVisible, setDropdownVisible] = useState(null);
  const [likedAnimations, setLikedAnimations] = useState(null);
  const user = useSelector(selectUser);
  const events = useSelector(selectEvents);
  const promotions = useSelector(selectPromotions) || [];
  const placeId = user?.businessDetails?.placeId;
  const scrollX = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef({});

  // Fetch data on component mount
  useEffect(() => {
    if (placeId) {
      dispatch(fetchEvents(placeId));
      dispatch(fetchPromotions(placeId));
    }
  }, [placeId]);

  console.log(promotions)

  const handleEdit = (item) => {
    if (selectedTab === "events") {
      navigation.navigate("CreateEvent", {
        businessId: placeId,
        event: item,
        onEventCreated: () => dispatch(fetchEvents(placeId)),
      });
    } else {
      navigation.navigate("CreatePromotion", {
        placeId,
        promotion: item,
        onPromotionCreated: () => dispatch(fetchPromotions(placeId)),
      });
    }
  };

  const handleCreateItem = () => {
    if (selectedTab === "events") {
      navigation.navigate("CreateEvent", {
        businessId: placeId,
        onEventCreated: () => dispatch(fetchEvents(placeId)),
      });
    } else {
      navigation.navigate("CreatePromotion", {
        placeId,
        onPromotionCreated: () => dispatch(fetchPromotions(placeId)),
      });
    }
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

  const handleLikeWithAnimation = (item, force = true) => {
    eventPromoLikeWithAnimation({
      type: item.kind.includes('Promo') ? 'promo' : 'event',
      postId: item._id,
      item,
      user,
      lastTapRef,
      likedAnimations,
      setLikedAnimations,
      dispatch,
      force,
    });
  };

  const handleOpenComments = (item) => {
    if (item.kind === "Event") {
      dispatch(fetchEventById({ eventId: item._id}))
    } else {
      dispatch(fetchPromotionById({ promotionId: item._id }))
    }
    navigation.navigate('EventDetails', { activity: item });
  };

  const isEventsTab = selectedTab === "events";
  const data = isEventsTab ? events : promotions;

  return (
    <View style={styles.container}>
      {/* Toggle Buttons */}
      {customHeaderTranslateY && (
        <Animated.View style={[styles.toggleContainer, { transform: [{ translateY: customHeaderTranslateY }] }]}>
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
        </Animated.View>
      )}
      <AnimatedFlatList
        data={data}
        keyExtractor={(item) => item._id}
        scrollEventThrottle={16}
        onScroll={
          scrollY
            ? Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              {
                useNativeDriver: true,
                listener: onScroll,
              }
            )
            : onScroll || undefined
        }
        ListHeaderComponent={<View style={styles.buffer} />}
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
              <EventDetailsCard item={item} selectedTab={selectedTab} styles={styles} />
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
                        isInteractive={false}
                      />
                    )}
                    style={{ width: Dimensions.get('window').width, marginTop: -10, }}
                  />
                  <PhotoPaginationDots photos={item.photos} scrollX={scrollX} />

                </>
              )}
              <View style={{ paddingLeft: 15 }}>
                <PostActions
                  item={item}
                  handleLikeWithAnimation={handleLikeWithAnimation}
                  handleOpenComments={() => handleOpenComments(item)}
                />
              </View>
            </View>
          </View>
        )}

      />
      {/* Create Button */}
      <TouchableOpacity style={styles.createButton} onPress={handleCreateItem}>
        <Text style={styles.createButtonText}>
          +
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default MyEventsPage;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    marginBottom: 40,
    paddingBottom: 40,
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: "#f5f5f5",
    paddingVertical: 5,
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
  buffer: {
    backgroundColor: '#009999',
    marginTop: 180,
    justifyContent: 'start'
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
  itemInfo: {
    flex: 1,
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
    position: 'absolute',
    bottom: 70,
    right: 15,
    padding: 15,
    borderRadius: 20,
    alignItems: "center",
  },
  createButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});



