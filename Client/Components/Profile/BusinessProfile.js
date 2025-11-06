import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  InteractionManager,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import bannerPlaceholder from '../../assets/pics/business-placeholder.png';
import EditProfileModal from "./EditProfileModal";
import { selectLogo, fetchLogo, selectBusinessBanner, resetBusinessBanner, resetLogo, fetchBusinessBanner, selectAlbum, fetchPhotos } from "../../Slices/PhotosSlice";
import { useRoute, useNavigation } from "@react-navigation/native";
import { fetchBusinessPosts, selectBusinessPosts, appendBusinessPosts, setBusinessPosts, resetBusinessPosts } from '../../Slices/PostsSlice';
import Reviews from "../Reviews/Reviews";
import Photos from "./Photos";
import { selectFavorites, addFavorite, removeFavorite } from "../../Slices/FavoritesSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { fetchBusinessRatingSummaries, selectRatingByPlaceId } from "../../Slices/PlacesSlice";
import ModalBox from 'react-native-modal';
import { selectConversations, chooseUserToMessage } from "../../Slices/DirectMessagingSlice";
import { fetchBusinessId, selectBusinessId, resetBusinessId } from "../../Slices/UserSlice";
import { fetchPromotions, selectPromotions, fetchPromotionById } from "../../Slices/PromotionsSlice";
import { fetchEvents, selectEvents, fetchEventById } from "../../Slices/EventsSlice";
import BusinessProfileHeader from "./BusinessProfileHeader";
import { eventPromoLikeWithAnimation } from "../../utils/LikeHandlers/promoEventLikes";
import BusinessNavTabs from "./BusinessNavTabs";
import EventPromoFeed from "../BusinessEvents/EventPromoFeed";

export default function BusinessProfile() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();
  const business = route?.params?.business;
  const conditionalSection = business ? "reviews" : "about";
  const user = business ? business : useSelector(selectUser)?.businessDetails;
  const mainUser = useSelector(selectUser);
  const mainUserFavorites = useSelector(selectFavorites);
  const reviews = useSelector(selectBusinessPosts);
  const logo = useSelector(selectLogo) || business?.logoFallback;
  const banner = useSelector(selectBusinessBanner);
  const photos = useSelector(selectAlbum);
  const conversations = useSelector(selectConversations) || [];
  const events = useSelector(selectEvents);
  const promotions = useSelector(selectPromotions);
  const businessName = user?.businessName;
  const placeId = user?.placeId || business?.placeId;
  const location = user?.location?.formattedAddress;
  const phone = user?.phone || "Enter a phone number";
  const description = user?.description || "Enter a description of your business";
  const [isFavorited, setIsFavorited] = useState(mainUserFavorites?.includes(placeId));
  const [favoriteModalVisible, setFavoriteModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState(conditionalSection);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [likedAnimations, setLikedAnimations] = useState(null);
  const placeIds = [placeId];
  const ratingData = useSelector(selectRatingByPlaceId(placeId)) || {};
  const businessId = useSelector(selectBusinessId);
  const isEventsTab = activeSection === "events";
  const eventPromoData = isEventsTab ? events : promotions;
  const scrollX = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef({});

  const {
    loadMore,
    refresh,
    isLoading,
    hasMore,
  } = usePaginatedFetch({
    fetchThunk: fetchBusinessPosts,
    appendAction: appendBusinessPosts,
    resetAction: setBusinessPosts,
    params: { placeId },
    limit: 10,
  });

  const handleFavoritePress = () => {
    if (isFavorited) {
      setFavoriteModalVisible(true);
    } else {
      dispatch(addFavorite({ userId: mainUser.id, placeId }));
      setIsFavorited(true);
    }
  };

  const handleRemoveFavorite = () => {
    dispatch(removeFavorite({ userId: mainUser.id, placeId }));
    setIsFavorited(false);
    setFavoriteModalVisible(false);
  };

  const handleGoBack = async () => {
    dispatch(resetBusinessPosts());
    navigation.goBack();
  };

  useEffect(() => {
    let task;

    if (business && placeId) {
      task = InteractionManager.runAfterInteractions(() => {
        dispatch(fetchBusinessId(placeId));
        dispatch(fetchEvents(placeId));
        dispatch(fetchPromotions(placeId));
      });
    }
    return () => {
      if (task) task.cancel();
    };
  }, [business, placeId]);

  useEffect(() => {
    if (placeId && typeof placeId === 'string' && placeId.trim() !== '') {
      dispatch(fetchLogo(placeId));
      dispatch(fetchBusinessBanner(placeId));
      dispatch(fetchPhotos(placeId));
      dispatch(fetchBusinessRatingSummaries(placeIds));

      // ✅ Delay refresh until after initial render to prevent blinking
      const task = InteractionManager.runAfterInteractions(() => {
        refresh();
      });

      return () => task.cancel();
    }
  }, [placeId]);

  const navgateToSettings = () => {
    navigation.navigate("Settings");
  };

  const handleSendMessage = () => {
    const currentUserId = mainUser?.id;

    if (!currentUserId || !placeId) return;

    const participantIds = [currentUserId, businessId].sort();

    const existingConversation = conversations.find(conv => {
      const ids = (conv.participants || [])
        .map(p => (typeof p === 'object' ? p._id : p)?.toString())
        .filter(Boolean)
        .sort();

      return (
        ids.length === participantIds.length &&
        ids.every((id, index) => id === participantIds[index])
      );
    });

    const participant = {
      _id: businessId,
      firstName: business?.businessName || "", // Business name in firstName field
      lastName: "", // Optional — can leave blank for businesses
      profilePic: logo ? { url: logo } : {}, // Construct profilePic object from logo URL
      profilePicUrl: logo || "", // Logo as profile picture
    };

    dispatch(chooseUserToMessage([participant]));

    navigation.navigate('MessageThread', {
      conversationId: existingConversation?._id || null,
      participants: [participant],
    });
  };

  const handleEventPromoLike = (item, force = true) => {
    eventPromoLikeWithAnimation({
      type: item.kind.includes('promo') ? 'promo' : 'event',
      postId: item._id,
      item,
      user: mainUser,
      lastTapRef,
      dispatch,
      force,
    });
  };

  const openPromoEventComments = (item) => {
    if (item.kind.toLowerCase() === "event") {
      dispatch(fetchEventById({ eventId: item._id }))
    } else {
      dispatch(fetchPromotionById({ promotionId: item._id }))
    }
    navigation.navigate('EventDetails', { activity: item });
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // Avoid resetting if going to MessageThread or another nested screen
      const nextRoute = e.data?.action?.payload?.name;

      if (nextRoute !== 'MessageThread') {
        dispatch(resetBusinessPosts());
        dispatch(resetBusinessBanner());
        dispatch(resetLogo());
        dispatch(resetBusinessId());
      }
    });

    return unsubscribe;
  }, [navigation]);

  const renderHeader = () => (
    <>
      {business && (
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
          <Ionicons name="chevron-back" size={24} color="gray" />
        </TouchableOpacity>
      )}
      <Image source={banner?.presignedUrl ? { uri: banner?.presignedUrl } : bannerPlaceholder} style={styles.banner} />
      <BusinessProfileHeader
        logo={logo}
        businessName={businessName}
        business={business}
        ratingData={ratingData}
        isFavorited={isFavorited}
        navgateToSettings={navgateToSettings}
        setEditModalVisible={setEditModalVisible}
        handleFavoritePress={handleFavoritePress}
        handleSendMessage={handleSendMessage}
      />
      <View style={styles.divider} />
      <BusinessNavTabs
        business={business}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />
      {activeSection === "reviews" && business && (
        <Reviews reviews={reviews} onLoadMore={loadMore} isLoadingMore={isLoading} hasMore={hasMore} />
      )}
      {activeSection === "about" && (
        <View style={styles.aboutContainer}>
          <Text style={styles.aboutLabel}>Address:</Text>
          <Text>{location}</Text>
          <Text style={styles.aboutLabel}>Phone:</Text>
          <Text>{phone}</Text>
          <Text style={styles.aboutLabel}>Description:</Text>
          <Text>{description}</Text>
        </View>
      )}
      {activeSection === "photos" && <Photos photos={photos} />}
      {(activeSection === "events" || activeSection === "promotions") && (
        <>
        <EventPromoFeed
          data={eventPromoData}
          scrollX={scrollX}
          likedAnimations={likedAnimations}
          lastTapRef={lastTapRef}
          activeSection={activeSection}
          handleEventPromoLike={handleEventPromoLike}
          openPromoEventComments={openPromoEventComments}
        />
        <View style={{ marginBottom: 40 }}/>
        </>
      )}
    </>
  );

  return (
    <>
      <FlatList
        style={styles.container}
        data={null}
        keyExtractor={(item) => item.photoKey}
        numColumns={3}
        ListHeaderComponent={() => renderHeader()}
        renderItem={() => null}
        contentContainerStyle={styles.photosGrid}
        showsVerticalScrollIndicator={false}
      />
      <EditProfileModal
        visible={editModalVisible}
        setEditModalVisible={setEditModalVisible}
        onClose={() => setEditModalVisible(false)}
        bannerPlaceholder={bannerPlaceholder}
        aboutInfo={{
          address: location,
          phone,
          description,
        }}
      />
      {/* React Native Modal */}
      <ModalBox
        isVisible={favoriteModalVisible}
        onBackdropPress={() => setFavoriteModalVisible(false)}
        style={styles.bottomModal} // ✅ Match styling
      >
        <View style={styles.modalContent}>
          {/* Modal Title */}
          <Text style={styles.modalTitle}>Remove from Favorites?</Text>
          {/* Remove Button */}
          <TouchableOpacity onPress={handleRemoveFavorite} style={styles.modalButton}>
            <MaterialCommunityIcons name="delete-outline" size={20} color="red" />
            <Text style={styles.modalButtonTextRed}>Remove</Text>
          </TouchableOpacity>
          {/* Cancel Button */}
          <TouchableOpacity style={styles.modalCancelButton}>
            <Text style={styles.modalCancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ModalBox>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 20,
    padding: 8,
    marginTop: 20,
  },
  banner: {
    height: 200,
    position: "relative", // To position the settings icon inside the banner
    width: '100%',
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "lightgray", // Line color
    marginVertical: 5, // Spacing above and below the line
  },
  aboutContainer: {
    padding: 10,
    width: '100%'
  },
  aboutLabel: {
    fontWeight: "bold",
    marginTop: 10,
  },
  photosGrid: {
    padding: 0,
  },
  bottomModal: {
    justifyContent: "flex-end",
    margin: 0,
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    justifyContent: "center",
  },
  modalButtonText: {
    fontSize: 16,
    marginLeft: 10,
    color: "#333",
  },
  modalButtonTextRed: {
    fontSize: 16,
    marginLeft: 10,
    color: "red",
  },
  modalCancelButton: {
    padding: 15,
    width: "100%",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#007bff",
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
});
