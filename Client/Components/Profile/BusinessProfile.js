import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, FlatList, InteractionManager, Animated } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { useRoute, useNavigation } from "@react-navigation/native";
import ModalBox from "react-native-modal";
import { selectUser, fetchBusinessId, selectBusinessId, resetBusinessId } from "../../Slices/UserSlice";
import { selectFavorites, addFavorite, removeFavorite } from "../../Slices/FavoritesSlice";
import { selectLogo, fetchLogo, selectBusinessBanner, resetBusinessBanner, resetLogo, fetchBusinessBanner, selectAlbum, fetchPhotos } from "../../Slices/PhotosSlice";
import { fetchBusinessPosts, appendBusinessPosts, setBusinessPosts, resetBusinessPosts } from "../../Slices/PostsSlice";
import { selectBusinessPosts } from "../../Slices/PostsSelectors/postsSelectors";
import { fetchBusinessRatingSummaries, selectRatingByPlaceId } from "../../Slices/PlacesSlice";
import { selectConversations, chooseUserToMessage } from "../../Slices/DirectMessagingSlice";
import { fetchPromotions, selectPromotions } from "../../Slices/PromotionsSlice";
import { fetchEvents, selectEvents } from "../../Slices/EventsSlice";
import BusinessProfileHeader from "./BusinessProfileHeader";
import BusinessNavTabs from "./BusinessNavTabs";
import BusinessProfileChrome from './BusinessProfileChrome';
import Reviews from "../Reviews/Reviews";
import Photos from "./Photos";
import EventPromoFeed from "../BusinessEvents/EventPromoFeed";
import EditProfileModal from "./EditProfileModal";
import bannerPlaceholder from "../../assets/pics/business-placeholder.png";
import usePaginatedFetch from "../../utils/usePaginatedFetch";

export default function BusinessProfile() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();
  const businessParam = route?.params?.business || null;
  const viewingOtherBusiness = !!businessParam;
  const mainUser = useSelector(selectUser, shallowEqual);
  const mainUserFavorites = useSelector(selectFavorites) || [];
  const user = viewingOtherBusiness ? businessParam : mainUser?.businessDetails;
  const placeId = user?.placeId || businessParam?.placeId || "";
  const businessName = user?.businessName || "";
  const location = user?.location?.formattedAddress;
  const phone = user?.phone || "Enter a phone number";
  const description = user?.description || "Enter a description of your business";
  const logo = useSelector(selectLogo) || businessParam?.logoFallback;
  const banner = useSelector(selectBusinessBanner);
  const bannerUrl = banner?.presignedUrl || "";
  const photos = useSelector(selectAlbum) || [];
  const reviews = useSelector(selectBusinessPosts) || [];
  const events = useSelector(selectEvents) || [];
  const promotions = useSelector(selectPromotions) || [];
  const ratingData = useSelector(selectRatingByPlaceId(placeId)) || {};
  const conversations = useSelector(selectConversations) || [];
  const businessId = useSelector(selectBusinessId);
  const scrollX = useRef(new Animated.Value(0)).current;
  const initialSection = viewingOtherBusiness ? "reviews" : "about";
  const [activeSection, setActiveSection] = useState(initialSection);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [favoriteModalVisible, setFavoriteModalVisible] = useState(false);

  const isFavorited = useMemo(() => {
    return Array.isArray(mainUserFavorites) && !!placeId && mainUserFavorites.includes(placeId);
  }, [mainUserFavorites, placeId]);

  const isEventsTab = activeSection === "events";
  const isPromosTab = activeSection === "promotions";
  const eventPromoData = useMemo(() => {
    if (activeSection === "events") return Array.isArray(events) ? events : [];
    if (activeSection === "promotions") return Array.isArray(promotions) ? promotions : [];
    return [];
  }, [activeSection, events, promotions]);

  const { loadMore, refresh, isLoading, hasMore } = usePaginatedFetch({
    fetchThunk: fetchBusinessPosts,
    appendAction: appendBusinessPosts,
    resetAction: setBusinessPosts,
    params: { placeId },
    limit: 10,
  });

  useEffect(() => {
    if (!placeId || typeof placeId !== "string" || !placeId.trim()) return;
    dispatch(fetchLogo(placeId));
    dispatch(fetchBusinessBanner(placeId));
    dispatch(fetchPhotos(placeId));
    dispatch(fetchBusinessRatingSummaries([placeId]));

    const task = InteractionManager.runAfterInteractions(() => {
      refresh();
    });

    return () => task.cancel();
  }, [dispatch, placeId, refresh]);

  useEffect(() => {
    if (!viewingOtherBusiness || !placeId) return;

    const task = InteractionManager.runAfterInteractions(() => {
      dispatch(fetchBusinessId(placeId));
      dispatch(fetchEvents(placeId));
      dispatch(fetchPromotions(placeId));
    });

    return () => task.cancel();
  }, [dispatch, viewingOtherBusiness, placeId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      const nextRoute = e.data?.action?.payload?.name;
      if (nextRoute === "MessageThread") return;

      dispatch(resetBusinessPosts());
      dispatch(resetBusinessBanner());
      dispatch(resetLogo());
      dispatch(resetBusinessId());
    });

    return unsubscribe;
  }, [navigation, dispatch]);

  /* ------------------------------ */
  /* Actions                         */
  /* ------------------------------ */
  const handleGoBack = useCallback(() => {
    dispatch(resetBusinessPosts());
    navigation.goBack();
  }, [dispatch, navigation]);

  const navgateToSettings = useCallback(() => {
    navigation.navigate("Settings");
  }, [navigation]);

  const handleFavoritePress = useCallback(() => {
    if (!placeId) return;

    if (isFavorited) {
      setFavoriteModalVisible(true);
    } else {
      dispatch(addFavorite({ userId: mainUser?.id, placeId }));
    }
  }, [dispatch, isFavorited, mainUser?.id, placeId]);

  const handleRemoveFavorite = useCallback(() => {
    if (!placeId) return;
    dispatch(removeFavorite({ userId: mainUser?.id, placeId }));
    setFavoriteModalVisible(false);
  }, [dispatch, mainUser?.id, placeId]);

  const handleSendMessage = useCallback(() => {
    const currentUserId = mainUser?.id;
    if (!currentUserId || !placeId || !businessId) return;

    const participantIds = [currentUserId, businessId].map(String).sort();

    const existingConversation = (conversations || []).find((conv) => {
      const ids = (conv.participants || [])
        .map((p) => (typeof p === "object" ? p._id : p))
        .map(String)
        .filter(Boolean)
        .sort();

      return ids.length === participantIds.length && ids.every((id, i) => id === participantIds[i]);
    });

    const participant = {
      _id: businessId,
      firstName: businessParam?.businessName || "",
      lastName: "",
      profilePic: logo ? { url: logo } : {},
      profilePicUrl: logo || "",
    };

    dispatch(chooseUserToMessage([participant]));

    navigation.navigate("MessageThread", {
      conversationId: existingConversation?._id || null,
      participants: [participant],
    });
  }, [dispatch, navigation, mainUser?.id, placeId, businessId, conversations, businessParam?.businessName, logo]);

  const chrome = useCallback(() => {
    return (
      <BusinessProfileChrome
        business={businessParam}
        bannerUrl={bannerUrl}
        logo={logo}
        businessName={businessName}
        ratingData={ratingData}
        isFavorited={isFavorited}
        onBack={handleGoBack}
        onGoSettings={navgateToSettings}
        onOpenEdit={setEditModalVisible}
        onToggleFavorite={handleFavoritePress}
        onSendMessage={handleSendMessage}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />
    );
  }, [
    businessParam,
    bannerUrl,
    logo,
    businessName,
    ratingData,
    isFavorited,
    handleGoBack,
    navgateToSettings,
    handleFavoritePress,
    handleSendMessage,
    activeSection,
  ]);

  const renderAbout = useCallback(() => {
    return (
      <FlatList
        style={styles.container}
        data={[{ key: "about" }]}
        keyExtractor={(x) => x.key}
        ListHeaderComponent={chrome}
        renderItem={() => (
          <View style={styles.aboutContainer}>
            <Text style={styles.aboutLabel}>Address:</Text>
            <Text>{location}</Text>

            <Text style={styles.aboutLabel}>Phone:</Text>
            <Text>{phone}</Text>

            <Text style={styles.aboutLabel}>Description:</Text>
            <Text>{description}</Text>

            <View style={{ height: 40 }} />
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />
    );
  }, [chrome, location, phone, description]);

  const renderReviews = useCallback(() => {
    return (
      <Reviews
        reviews={reviews}
        onLoadMore={loadMore}
        isLoadingMore={isLoading}
        hasMore={hasMore}
        ListHeaderComponent={chrome}
      />
    );
  }, [reviews, loadMore, isLoading, hasMore, chrome]);

  const renderPhotos = useCallback(() => {
    return <Photos photos={photos} ListHeaderComponent={chrome} />;
  }, [photos, chrome]);

  const renderEventsPromos = useCallback(() => {
    return (
      <EventPromoFeed
        data={eventPromoData}
        scrollX={scrollX}
        activeSection={activeSection}
        ListHeaderComponent={chrome}
        ListFooterComponent={<View style={{ height: 40 }} />}
      />
    );
  }, [eventPromoData, activeSection, chrome, scrollX]);

  const body = useMemo(() => {
    if (activeSection === "reviews" && viewingOtherBusiness) return renderReviews();
    if (activeSection === "photos") return renderPhotos();
    if (activeSection === "events" || activeSection === "promotions") return renderEventsPromos();
    return renderAbout();
  }, [activeSection, viewingOtherBusiness, renderReviews, renderPhotos, renderEventsPromos, renderAbout]);

  return (
    <>
      {body}
      <EditProfileModal
        visible={editModalVisible}
        setEditModalVisible={setEditModalVisible}
        onClose={() => setEditModalVisible(false)}
        bannerPlaceholder={bannerPlaceholder}
        aboutInfo={{ address: location, phone, description }}
      />
      <ModalBox
        isVisible={favoriteModalVisible}
        onBackdropPress={() => setFavoriteModalVisible(false)}
        style={styles.bottomModal}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Remove from Favorites?</Text>
          <TouchableOpacity onPress={handleRemoveFavorite} style={styles.modalButton}>
            <MaterialCommunityIcons name="delete-outline" size={20} color="red" />
            <Text style={styles.modalButtonTextRed}>Remove</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFavoriteModalVisible(false)} style={styles.modalCancelButton}>
            <Text style={styles.modalCancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ModalBox>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
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
  banner: { height: 200, width: "100%" },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "lightgray",
    marginVertical: 5,
  },
  aboutContainer: { padding: 10, width: "100%" },
  aboutLabel: {
    fontWeight: "bold",
    marginTop: 10,
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
});
