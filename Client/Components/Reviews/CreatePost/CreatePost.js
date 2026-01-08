import React, { useState, useEffect, useCallback } from "react";
import { View, TextInput, StyleSheet, FlatList, Alert, KeyboardAvoidingView, Keyboard, TouchableWithoutFeedback } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSelector } from "react-redux";
import EditPhotosModal from "../../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../../Profile/EditPhotoDetailsModal";
import TagFriendsModal from "../TagFriendsModal";
import { selectUser } from "../../../Slices/UserSlice";
import { selectMediaFromGallery } from "../../../utils/selectPhotos";
import { mergeMedia } from "../../../utils/CameraScreen/mergeMedia";
import InviteForm from "../../ActivityInvites/InviteForm";
import SectionHeader from "../SectionHeader";
import PostTypeToggle from "./PostTypeToggle";
import ReviewForm from "./ReviewForm";
import SubmitButton from "./SubmitButton";
import RecapHeader from "./RecapHeader";
import PostExtrasRow from "./PostExtrasSection";
import TaggedFriendsPreview from "./TaggedFriendsPreview";
import MediaPreview from "./MediaPreview";
import useSubmitPost from "../../../hooks/useSubmitPost";
import useVenueSelection from "../../../hooks/useVenueSelection";
import VenuePicker from "./VenuePicker";

export default function CreatePost() {
  const navigation = useNavigation();
  const route = useRoute();
  const user = useSelector(selectUser);
  const { submit, submitting } = useSubmitPost();
  const [rating, setRating] = useState(3);
  const [wouldGoBack, setWouldGoBack] = useState(null);
  const [vibeTags, setVibeTags] = useState([]);
  const [priceRating, setPriceRating] = useState(null);
  const [review, setReview] = useState("");
  const [checkInMessage, setCheckInMessage] = useState("");
  const [media, setMedia] = useState([]);
  const [taggedUsers, setTaggedUsers] = useState([]);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
  const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
  const [tagFriendsModalVisible, setTagFriendsModalVisible] = useState(false);
  const isEditing = route.params?.isEditing || false;
  const initialPost = route.params?.initialPost || null;
  const relatedInviteId = route.params?.relatedInviteId || null;
  const initialBusinessFromRoute = route.params?.initialBusiness || null;
  const inviteDateTimeLabel = route.params?.inviteDateTimeLabel || null;
  const isRecap = !!relatedInviteId && !isEditing;
  const initialType = route.params?.isEditing
    ? route.params?.initialPost?.type
    : route.params?.postType;

  const [postType, setPostType] = useState(initialType);

  // ✅ venue logic isolated
  const {
    business,
    inviteVenueMode,
    customVenue,
    setCustomVenue,
    inviteVenue,
    prefillLabel,
    placesKey,
    handlePlaceSelected,
    clearBusiness,
    selectInvitePlaceVenue,
    selectInviteCustomVenue,
  } = useVenueSelection({
    navigation,
    routeKey: route.key,
    postType,
    isEditing,
    initialPost,
    initialBusinessFromRoute,
  });

  // --- hydrate non-venue fields when editing ---
  useEffect(() => {
    if (!isEditing || !initialPost) return;

    setReview(initialPost.message || "");
    setCheckInMessage(initialPost.message || "");
    setTaggedUsers(initialPost.taggedUsers || []);

    // ✅ single media hydration
    setMedia(Array.isArray(initialPost.media) ? initialPost.media : []);

    const details = initialPost.details || {};
    setPriceRating(details.priceRating != null ? details.priceRating : null);

    const existingWouldGoBack =
      details.wouldGoBack ||
      (typeof details.wouldRecommend === "boolean"
        ? details.wouldRecommend
          ? "yes"
          : "no"
        : null);

    setWouldGoBack(existingWouldGoBack);
    setVibeTags(Array.isArray(details.vibeTags) ? details.vibeTags : []);
    setRating(details.rating || 3);
  }, [isEditing, initialPost?._id]);

  // --- merge captured media from camera ---
  useEffect(() => {
    const incoming = route.params?.capturedMedia;
    if (!Array.isArray(incoming) || incoming.length === 0) return;

    setMedia((prev) => mergeMedia(Array.isArray(prev) ? prev : [], incoming));
    navigation.setParams({ capturedMedia: null });
  }, [route.params?.capturedMedia, navigation]);

  const handleSubmit = useCallback(async () => {
    const isReview = postType === "review";
    const safeMedia = Array.isArray(media) ? media : [];

    try {
      const res = await submit({
        user,
        isEditing,
        initialPost,
        postType,
        business,
        inviteVenue, // custom invites handled in submitPost already
        media: safeMedia,
        taggedUsers,
        rating,
        wouldGoBack,
        priceRating,
        vibeTags,
        reviewText: isReview ? review : null,
        checkInMessage: !isReview ? checkInMessage : null,
        relatedInviteId,
      });

      Alert.alert(
        "Success",
        `Your ${postType} has been ${res.mode === "update" ? "updated" : "posted"}!`
      );
      navigation.goBack();
    } catch (err) {
      Alert.alert("Error", err?.message || "Failed to submit.");
    }
  }, [
    submit,
    user,
    isEditing,
    initialPost,
    postType,
    business,
    inviteVenue,
    media,
    taggedUsers,
    rating,
    wouldGoBack,
    priceRating,
    vibeTags,
    review,
    checkInMessage,
    relatedInviteId,
    navigation,
  ]);

  const handlePhotoAlbumSelection = async () => {
    const newFiles = await selectMediaFromGallery();
    if (!Array.isArray(newFiles) || newFiles.length === 0) return;

    const getKey = (p) => p?.photoKey || p?.localKey || p?.uri || p?._id;

    // 1) Ensure existing media has stable order
    const existing = Array.isArray(media) ? media : [];
    const existingWithOrder = existing.map((p, idx) =>
      p?.order != null ? p : { ...p, order: idx }
    );

    const maxOrder =
      existingWithOrder.length > 0
        ? Math.max(...existingWithOrder.map((p) => p.order ?? 0))
        : -1;

    // 2) Stamp `order` onto new files
    const prepared = newFiles.map((file, i) => ({
      ...file,
      taggedUsers: [],
      description: file?.description || "",
      uri: file?.uri,
      order: maxOrder + 1 + i,
    }));

    // 3) Merge + dedupe + sort
    const seen = new Set();
    const merged = [...existingWithOrder, ...prepared];

    const deduped = merged.filter((p) => {
      const key = getKey(p);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const ordered = deduped.sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));

    setMedia(ordered);
    setEditPhotosModalVisible(true);
    setPreviewPhoto(null);
  };

  const handleOpenPhotoDetails = (item) => {
    setPhotoDetailsEditing(true);
    setPreviewPhoto(item);
  };

  const handleClosePhotoDetails = () => {
    setPhotoDetailsEditing(false);
    setPreviewPhoto(null);
  };

  const openCamera = () => {
    navigation.navigate("CameraScreen", {
      returnRouteName: route.name,
      returnRouteKey: route.key,
      returnMode: "post",
    });
  };

  const recapNeedsPlaceSelection =
    isRecap &&
    (postType === "review" || postType === "check-in") &&
    !business?.place_id &&
    !initialBusinessFromRoute?.place_id;

  const showLocationPicker = !isRecap || recapNeedsPlaceSelection;

  if (!postType) return null;

  return (
    <View style={{ flex: 1, backgroundColor: "white", marginTop: 10 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <FlatList
            data={[{}]}
            keyExtractor={(_, i) => i.toString()}
            ListHeaderComponentStyle={{ zIndex: 99999, elevation: 50 }}
            renderItem={() => (
              <>
                {postType === "review" && (
                  <ReviewForm
                    rating={rating}
                    setRating={setRating}
                    wouldGoBack={wouldGoBack}
                    setWouldGoBack={setWouldGoBack}
                    vibeTags={vibeTags}
                    setVibeTags={setVibeTags}
                    priceRating={priceRating}
                    setPriceRating={setPriceRating}
                    reviewText={review}
                    setReviewText={setReview}
                  />
                )}
                {postType === "check-in" && (
                  <>
                    <SectionHeader title="Check-in Message (Optional)" />
                    <TextInput
                      style={styles.textArea}
                      value={checkInMessage}
                      onChangeText={setCheckInMessage}
                      multiline
                    />
                  </>
                )}
                {postType === "invite" && (
                  <InviteForm
                    isEditing={isEditing}
                    initialInvite={initialPost}
                    selectedVenue={inviteVenue || initialPost?.venue || null}
                    selectedMedia={media}
                    setSelectedMedia={setMedia}
                  />
                )}
                <PostExtrasRow
                  taggedUsers={taggedUsers}
                  media={media}
                  onOpenTagModal={() => setTagFriendsModalVisible(true)}
                  onOpenCamera={openCamera}
                  onOpenLibrary={handlePhotoAlbumSelection}
                />
                <MediaPreview
                  media={media}
                  onOpenPhotoDetails={handleOpenPhotoDetails}
                  onOpenEditPhotos={() => setEditPhotosModalVisible(true)}
                />
                {postType !== "invite" && (
                  <>
                    <TaggedFriendsPreview
                      taggedUsers={taggedUsers}
                      onOpenTagModal={() => setTagFriendsModalVisible(true)}
                    />
                    <SubmitButton
                      label={!isEditing ? "Post" : "Save changes"}
                      onPress={handleSubmit}
                      disabled={submitting}
                    />
                  </>
                )}
              </>
            )}
            ListHeaderComponent={
              <>
                {!isEditing && (
                  <PostTypeToggle
                    postType={postType}
                    setPostType={setPostType}
                    hideTypes={isRecap ? ["invite"] : []}
                  />
                )}
                {!isEditing && relatedInviteId && (
                  <RecapHeader
                    relatedInviteId={relatedInviteId}
                    business={business || initialBusinessFromRoute}
                    inviteDateTimeLabel={inviteDateTimeLabel}
                  />
                )}
                <VenuePicker
                  postType={postType}
                  show={showLocationPicker}
                  inviteVenueMode={inviteVenueMode}
                  onSelectInvitePlace={selectInvitePlaceVenue}
                  onSelectInviteCustom={selectInviteCustomVenue}
                  customVenue={customVenue}
                  setCustomVenue={setCustomVenue}
                  placesKey={placesKey}
                  prefillLabel={prefillLabel}
                  onPlaceSelected={handlePlaceSelected}
                  onClearPlace={clearBusiness}
                />
              </>
            }
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, marginTop: 120 }}
            keyboardShouldPersistTaps="handled"
          />
        </TouchableWithoutFeedback>
        <TagFriendsModal
          visible={tagFriendsModalVisible}
          onSave={setTaggedUsers}
          onClose={() => setTagFriendsModalVisible(false)}
          initialSelectedFriends={taggedUsers}
          isTagging={true}
        />
        {/* ✅ updated modal API (see below) */}
        <EditPhotosModal
          visible={editPhotosModalVisible}
          media={media}
          setMedia={setMedia}
          onClose={() => setEditPhotosModalVisible(false)}
          isPromotion={false}
          onDelete={() => { }}
        />
        {previewPhoto && (
          <EditPhotoDetailsModal
            visible={photoDetailsEditing}
            photo={previewPhoto}
            media={media}
            setMedia={setMedia}
            onClose={handleClosePhotoDetails}
            onDelete={() => { }}
            isPromotion={false}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  textArea: {
    height: 100,
    backgroundColor: "#fff",
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    marginBottom: 15,
    marginTop: 5,
    textAlignVertical: "top",
  },
});
