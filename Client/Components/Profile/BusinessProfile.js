import React, { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { InteractionManager, Animated } from "react-native";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { useRoute, useNavigation } from "@react-navigation/native";
import { selectUser, fetchBusinessId, resetBusinessId } from "../../Slices/UserSlice";
import { fetchLogo, resetBusinessBanner, resetLogo, fetchBusinessBanner, selectAlbum } from "../../Slices/PhotosSlice";
import { fetchBusinessPosts, appendBusinessPosts, setBusinessPosts, resetBusinessPosts } from "../../Slices/PostsSlice";
import { selectBusinessPosts } from "../../Slices/PostsSelectors/postsSelectors";
import { fetchBusinessRatingSummaries } from "../../Slices/PlacesSlice";
import { fetchPromotions, selectPromotions } from "../../Slices/PromotionsSlice";
import { fetchEvents, selectEvents } from "../../Slices/EventsSlice";
import BusinessProfileChrome from "./BusinessProfileChrome";
import Reviews from "../Reviews/Reviews";
import EditProfileModal from "./EditProfileModal";
import bannerPlaceholder from "../../assets/pics/business-placeholder.png";
import usePaginatedFetch from "../../utils/usePaginatedFetch";

function chunkIntoRows(arr, size = 3) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function BusinessProfile() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();
  const businessParam = route?.params?.business || null;
  const viewingOtherBusiness = !!businessParam;
  const mainUser = useSelector(selectUser, shallowEqual);
  const user = viewingOtherBusiness ? businessParam : mainUser?.businessDetails;
  const placeId = user?.placeId || businessParam?.placeId || "";
  const location = user?.location?.formattedAddress;
  const phone = user?.phone || "Enter a phone number";
  const description = user?.description || "Enter a description of your business";
  const album = useSelector(selectAlbum) || [];
  const reviews = useSelector(selectBusinessPosts) || [];
  const events = useSelector(selectEvents) || [];
  const promotions = useSelector(selectPromotions) || [];
  const scrollX = useRef(new Animated.Value(0)).current;
  const initialSection = viewingOtherBusiness ? "reviews" : "about";
  const [activeSection, setActiveSection] = useState(initialSection);
  const [editModalVisible, setEditModalVisible] = useState(false);
  
  const { loadMore, refresh, isLoading, hasMore } = usePaginatedFetch({
    fetchThunk: fetchBusinessPosts,
    appendAction: appendBusinessPosts,
    resetAction: setBusinessPosts,
    params: { placeId },
    limit: 10,
  });

  const resetBusinessScreenState = useCallback(() => {
    dispatch(resetBusinessPosts());
    dispatch(resetBusinessBanner());
    dispatch(resetLogo());
    dispatch(resetBusinessId());
  }, [dispatch]);

  useEffect(() => {
    if (!placeId || typeof placeId !== "string" || !placeId.trim()) return;
    dispatch(fetchLogo(placeId));
    dispatch(fetchBusinessBanner(placeId));
    // dispatch(fetchPhotos(placeId));
    dispatch(fetchBusinessRatingSummaries([placeId]));

    const task = InteractionManager.runAfterInteractions(() => refresh());
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

      resetBusinessScreenState();
    });

    return unsubscribe;
  }, [navigation, dispatch]);

  const listData = useMemo(() => {
    if (activeSection === "about") {
      return [
        {
          type: "aboutRow",
          key: "aboutRow",
          location,
          phone,
          description,
        },
      ];
    }

    if (activeSection === "photos") {
      const pickUrl = (m) => m?.url || m?.presignedUrl || m?.photoUrl || m?.src || m?.uri || null;
      const urls = (Array.isArray(album) ? album : []).map(pickUrl).filter(Boolean);
      const rows = chunkIntoRows(urls, 3);

      return rows.map((row, idx) => ({
        type: "photoRow",
        key: `photoRow-${idx}`,
        row: row.map((url) => ({ url })),
      }));
    }

    if (activeSection === "events") {
      return (Array.isArray(events) ? events : []).map((e, idx) => ({
        ...e,
        type: "event",
        key: String(e?._id || e?.id || `event-${idx}`),
      }));
    }

    if (activeSection === "promotions") {
      return (Array.isArray(promotions) ? promotions : []).map((p, idx) => ({
        ...p,
        type: "promotion",
        key: String(p?._id || p?.id || `promotion-${idx}`),
      }));
    }

    // default: "reviews"
    return Array.isArray(reviews) ? reviews : [];
  }, [activeSection, album, events, promotions, reviews, location, phone, description]);

  const enablePaging = activeSection === "reviews" && viewingOtherBusiness;

  return (
    <>
      <Reviews
        reviews={listData}
        onLoadMore={enablePaging ? loadMore : undefined}
        isLoadingMore={enablePaging ? isLoading : false}
        hasMore={enablePaging ? hasMore : false}
        mediaScrollX={scrollX}
        disableEngagementViews={true}
        ListHeaderComponent={
          <BusinessProfileChrome
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            setEditModalVisible={setEditModalVisible}
          />
        }
      />
      <EditProfileModal
        visible={editModalVisible}
        setEditModalVisible={setEditModalVisible}
        onClose={() => setEditModalVisible(false)}
        bannerPlaceholder={bannerPlaceholder}
        aboutInfo={{ address: location, phone, description }}
      />
    </>
  );
}