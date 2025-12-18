import React, { useMemo, useCallback } from "react";
import { View, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { useNavigation, useRoute } from "@react-navigation/native";
import bannerPlaceholder from "../../assets/pics/business-placeholder.png";
import BusinessProfileHeader from "./BusinessProfileHeader";
import BusinessNavTabs from "./BusinessNavTabs";
import { selectUser, selectBusinessId, resetBusinessId } from "../../Slices/UserSlice";
import { selectConversations, chooseUserToMessage } from "../../Slices/DirectMessagingSlice";
import { selectLogo, selectBusinessBanner, resetBusinessBanner, resetLogo } from "../../Slices/PhotosSlice";
import { resetBusinessPosts } from "../../Slices/PostsSlice";
import { selectRatingByPlaceId } from "../../Slices/PlacesSlice";
import { toId } from "../../utils/Formatting/toId";

function BusinessProfileChrome({
  activeSection,
  setActiveSection,
  setEditModalVisible,      
}) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();
  const businessParam = route?.params?.business || null; // viewing another business if present
  const viewingOtherBusiness = !!businessParam;
  const mainUser = useSelector(selectUser, shallowEqual);
  const myId = toId(mainUser?.id || mainUser?._id);
  const businessDetails = mainUser?.businessDetails || {};
  const placeId = businessParam?.placeId || businessDetails?.placeId || "";
  const businessName = businessParam?.businessName || businessDetails?.businessName || "";
  const logoFromStore = useSelector(selectLogo);
  const logo = logoFromStore || businessParam?.logoFallback || "";
  const banner = useSelector(selectBusinessBanner);
  const bannerUrl = banner?.presignedUrl || banner?.url || "";
  const ratingSelector = useMemo(() => selectRatingByPlaceId(placeId), [placeId]);
  const ratingData = useSelector(ratingSelector) || {};
  const conversations = useSelector(selectConversations) || [];
  const businessId = useSelector(selectBusinessId);

  const onBack = useCallback(() => {
    dispatch(resetBusinessPosts());
    dispatch(resetBusinessBanner());
    dispatch(resetLogo());
    dispatch(resetBusinessId());
    navigation.goBack();
  }, [dispatch, navigation]);

  const onGoSettings = useCallback(() => {
    navigation.navigate("Settings");
  }, [navigation]);

  const onSendMessage = useCallback(() => {
    if (!viewingOtherBusiness) return;
    const currentUserId = myId;
    const otherId = toId(businessId);
    if (!currentUserId || !otherId) return;

    const participantIds = [currentUserId, otherId].sort();

    const existingConversation = (conversations || []).find((conv) => {
      const ids = (conv.participants || [])
        .map((p) => (typeof p === "object" ? p._id : p))
        .map(toId)
        .filter(Boolean)
        .sort();

      return ids.length === participantIds.length && ids.every((id, i) => id === participantIds[i]);
    });

    const participant = {
      _id: businessId,
      firstName: businessName || "",
      lastName: "",
      profilePic: logo ? { url: logo } : {},
      profilePicUrl: logo || "",
    };

    dispatch(chooseUserToMessage([participant]));

    navigation.navigate("MessageThread", {
      conversationId: existingConversation?._id || null,
      participants: [participant],
    });
  }, [dispatch, navigation, viewingOtherBusiness, myId, businessId, conversations, businessName, logo]);

  return (
    <>
      {viewingOtherBusiness && (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color="gray" />
        </TouchableOpacity>
      )}
      <Image source={bannerUrl ? { uri: bannerUrl } : bannerPlaceholder} style={styles.banner} />
      <BusinessProfileHeader
        logo={logo}
        businessName={businessName}
        business={businessParam} 
        ratingData={ratingData}
        navgateToSettings={onGoSettings}
        setEditModalVisible={setEditModalVisible}
        handleSendMessage={onSendMessage}
      />
      <View style={styles.divider} />
      <BusinessNavTabs
        business={businessParam}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />
    </>
  );
}

export default React.memo(BusinessProfileChrome);

const styles = StyleSheet.create({
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
  divider: { width: "100%", height: 1, backgroundColor: "lightgray", marginVertical: 5 },
});
