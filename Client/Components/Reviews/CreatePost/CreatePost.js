import React, { useState, useEffect, useRef } from "react";
import { View, TextInput, StyleSheet, FlatList, Alert, KeyboardAvoidingView, Keyboard, TouchableWithoutFeedback } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import EditPhotosModal from "../../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../../Profile/EditPhotoDetailsModal";
import TagFriendsModal from "../TagFriendsModal";
import { selectUser } from "../../../Slices/UserSlice";
import { createPost, updatePost } from "../../../Slices/PostsSlice";
import { createNotification } from "../../../Slices/NotificationsSlice";
import { createBusinessNotification } from "../../../Slices/BusNotificationsSlice";
import { selectMediaFromGallery } from "../../../utils/selectPhotos";
import { handlePhotoUpload } from "../../../utils/photoUploadHelper";
import { mergeMedia } from '../../../utils/CameraScreen/mergeMedia';
import InviteForm from "../../ActivityInvites/InviteForm";
import SectionHeader from "../SectionHeader";
import Autocomplete from "../../Location/Autocomplete";
import PostTypeToggle from "./PostTypeToggle";
import ReviewForm from "./ReviewForm";
import SubmitButton from "./SubmitButton";
import RecapHeader from "./RecapHeader";
import PostExtrasRow from './PostExtrasSection';
import TaggedFriendsPreview from './TaggedFriendsPreview';
import MediaPreview from "./MediaPreview";

export default function CreatePost() {
  const navigation = useNavigation();
  const route = useRoute();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const [business, setBusiness] = useState(null);
  const [rating, setRating] = useState(3);
  const [wouldGoBack, setWouldGoBack] = useState(null); // 'yes' | 'maybe' | 'no'
  const [vibeTags, setVibeTags] = useState([]); // string[]
  const [priceRating, setPriceRating] = useState(null); // 1–4, optional
  const [review, setReview] = useState("");
  const [checkInMessage, setCheckInMessage] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [photoList, setPhotoList] = useState([]);
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
  const googlePlacesRef = useRef(null);
  const fullName = `${user.firstName} ${user?.lastName}`;

  const initialType = route.params?.isEditing
    ? route.params?.initialPost?.type
    : route.params?.postType;
  const [postType, setPostType] = useState(initialType);
  const isRecap = !!relatedInviteId && !isEditing;

  useEffect(() => {
    if (isEditing && initialPost) {
      setReview(initialPost.message || "");
      setCheckInMessage(initialPost.message || "");
      setTaggedUsers(initialPost.taggedUsers || []);
      setSelectedPhotos(initialPost.media || []);
      setPhotoList(initialPost.media || []);

      const details = initialPost.details || {};

      setPriceRating(
        details.priceRating != null ? details.priceRating : null
      );

      // Backwards compatibility: map old wouldRecommend boolean → wouldGoBack
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

      setBusiness({
        place_id: initialPost.placeId,
        name: initialPost.businessName,
        formatted_address: initialPost.location || "",
      });

      if (initialPost.businessName) {
        googlePlacesRef.current?.setAddressText(`${initialPost.businessName}`);
      }
    }
  }, [isEditing, initialPost]);

  useEffect(() => {
    // Only for NEW posts that came from a recap badge
    if (!isEditing && initialBusinessFromRoute && !business) {
      setBusiness(initialBusinessFromRoute);

      if (initialBusinessFromRoute.name && googlePlacesRef.current) {
        googlePlacesRef.current.setAddressText(initialBusinessFromRoute.name);
      }
    }
  }, [isEditing, initialBusinessFromRoute, business]);

  useEffect(() => {
    const incoming = route.params?.capturedMedia;
    if (!Array.isArray(incoming) || incoming.length === 0) return;

    setSelectedPhotos((prev) => mergeMedia(prev, incoming));

    // IMPORTANT: clear the param so it doesn’t re-apply on future renders/focus
    navigation.setParams({ capturedMedia: null });
  }, [route.params?.capturedMedia]);

  useEffect(() => {
    setPhotoList(selectedPhotos);
  }, [selectedPhotos]);

  const handlePhotoAlbumSelection = async () => {
    const newFiles = await selectMediaFromGallery();
    if (!newFiles || newFiles.length === 0) return;

    const getKey = (p) => p.photoKey || p.localKey || p.uri || p._id;

    // 1) Ensure existing photos have a stable `order`
    const existingWithOrder = (photoList || []).map((p, idx) =>
      p?.order != null ? p : { ...p, order: idx }
    );
    const maxOrder =
      existingWithOrder.length > 0
        ? Math.max(...existingWithOrder.map((p) => p.order))
        : -1;

    // 2) Stamp `order` onto the new files
    const prepared = newFiles.map((file, i) => ({
      ...file,
      taggedUsers: [],
      description: file.description || "",
      uri: file.uri,
      order: maxOrder + 1 + i,
    }));

    // 3) Merge, de-dupe by a stable key (keep first occurrence), then sort by `order`
    const seen = new Set();
    const merged = [...existingWithOrder, ...prepared];
    const deduped = merged.filter((photo) => {
      const key = getKey(photo);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const ordered = deduped.sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );

    setSelectedPhotos(ordered);
    setPhotoList(ordered);
    setEditPhotosModalVisible(true);
    setPreviewPhoto(null);
  };

  const getPhotoKey = (p) => p.photoKey || p.localKey || p.uri || p._id;

  const replaceInPlace = (list, updated) => {
    const k = getPhotoKey(updated);
    const idx = list.findIndex((p) => getPhotoKey(p) === k);
    if (idx === -1) return list;
    const next = list.slice();
    next[idx] = { ...list[idx], ...updated };
    return next;
  };

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList((prev) => replaceInPlace(prev, updatedPhoto));
    setSelectedPhotos((prev) => replaceInPlace(prev, updatedPhoto));
  };

  const handlePhotoDelete = (photoToDelete) => {
    setSelectedPhotos((prev) =>
      prev.filter((photo) => {
        const matchById =
          photo._id &&
          photoToDelete._id &&
          photo._id === photoToDelete._id;
        const matchByKey =
          photo.photoKey &&
          photoToDelete.photoKey &&
          photo.photoKey === photoToDelete.photoKey;
        const matchByUri =
          photo.uri &&
          photoToDelete.uri &&
          photo.uri === photoToDelete.uri;
        return !(matchById || matchByKey || matchByUri);
      })
    );
    setPhotoDetailsEditing(false);
  };

  // ------------ helpers -------------
  const normalizeId = (u) => u?._id || u?.userId || u?.id;

  const uploadDedupPhotos = async ({ dispatch, userId, placeId, photos }) => {
    if (!Array.isArray(photos) || photos.length === 0) return [];
    const seen = new Set();
    const deduped = [];
    for (const p of photos) {
      const k = p.photoKey || p.uri || p.localKey || JSON.stringify(p);
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(p);
      }
    }
    return handlePhotoUpload({ dispatch, userId, placeId, photos: deduped });
  };

  const notifyAll = async ({
    dispatch,
    fullName,
    currentUserId,
    placeId,
    businessName,
    postType,
    postId,
    taggedUsers,
    uploadedPhotos,
  }) => {
    const postTagPromises = (taggedUsers || []).map((tu) =>
      dispatch(
        createNotification({
          userId: normalizeId(tu),
          type: "tag",
          message: `${fullName} tagged you in a ${postType}!`,
          relatedId: currentUserId,
          typeRef: "User",
          targetId: postId,
          postType,
        })
      )
    );

    const photoTagPromises = (uploadedPhotos || []).flatMap((photo) =>
      (photo.taggedUsers || []).map((u) =>
        dispatch(
          createNotification({
            userId: normalizeId(u),
            type: "photoTag",
            message: `${fullName} tagged you in a photo!`,
            relatedId: currentUserId,
            typeRef: "User",
            targetId: postId,
            postType,
          })
        )
      )
    );

    const businessPromise = dispatch(
      createBusinessNotification({
        placeId,
        postType,
        type: postType,
        message: `${fullName} ${postType === "review" ? "left a review on" : "checked in at"
          } ${businessName}`,
        relatedId: currentUserId,
        typeRef: "User",
        targetId: postId,
        targetRef: "Post",
      })
    );

    return Promise.all([
      ...postTagPromises,
      ...photoTagPromises,
      businessPromise,
    ]);
  };

  const handleSubmit = async () => {
    const isReview = postType === "review";
    const trimmedReview = (review || "").trim();
    const trimmedCheckIn = (checkInMessage || "").trim();

    const safeStringify = (v) => {
      try {
        return JSON.stringify(v, null, 2);
      } catch {
        return String(v);
      }
    };

    const extractErrMessage = (err) => {
      if (!err) return null;
      if (typeof err === "string") return err;
      if (err?.message) return err.message;

      const axiosMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.response?.data ||
        err?.response?.statusText;

      if (axiosMsg) return typeof axiosMsg === "string" ? axiosMsg : safeStringify(axiosMsg);

      if (err?.payload) {
        if (typeof err.payload === "string") return err.payload;
        if (err.payload?.message) return err.payload.message;
        return safeStringify(err.payload);
      }

      if (err?.error) return typeof err.error === "string" ? err.error : safeStringify(err.error);
      return safeStringify(err);
    };

    if (!business) {
      Alert.alert("Error", "Please choose a place.");
      return;
    }

    if (isReview && (!rating || !wouldGoBack)) {
      Alert.alert("Error", "Please add an overall rating and whether you'd go back.");
      return;
    }

    try {
      const currentUserId = user?.id || user?._id;
      const placeId = business.place_id;
      const businessName = business.name || "";
      const location = business.formatted_address || "";

      const rawPhotos =
        (Array.isArray(photoList) && photoList.length > 0 ? photoList : selectedPhotos) || [];

      const uploadedPhotos = await uploadDedupPhotos({
        dispatch,
        userId: currentUserId,
        placeId,
        photos: rawPhotos,
      });

      const taggedUserIds = (taggedUsers || []).map(normalizeId).filter(Boolean);

      let postId;

      if (isEditing && initialPost) {
        const base = {
          placeId,
          taggedUsers: taggedUserIds,
          photos: uploadedPhotos,
        };

        const updates = isReview
          ? {
            ...base,
            rating,
            wouldGoBack,
            priceRating,
            vibeTags,
            reviewText: trimmedReview || null,
            message: trimmedReview || null,
          }
          : {
            ...base,
            message: trimmedCheckIn || null,
          };

        await dispatch(updatePost({ postId: initialPost._id, updates })).unwrap();

        postId = initialPost._id;
        Alert.alert("Success", `Your ${postType} has been updated!`);
      } else {
        const payload = {
          type: postType,
          userId: currentUserId,
          placeId,
          location,
          businessName,
          photos: uploadedPhotos,
          taggedUsers: taggedUserIds,
          ...(relatedInviteId ? { relatedInviteId } : {}),
          ...(isReview
            ? {
              message: trimmedReview || null,
              reviewText: trimmedReview || null,
              rating,
              wouldGoBack,
              priceRating,
              vibeTags,
            }
            : { message: trimmedCheckIn || null }),
        };

        const created = await dispatch(createPost(payload)).unwrap();

        postId = created._id;
        Alert.alert("Success", `Your ${postType} has been posted!`);
      }

      await notifyAll({
        dispatch,
        fullName,
        currentUserId,
        placeId,
        businessName,
        postType,
        postId,
        taggedUsers,
        uploadedPhotos,
      });

      navigation.goBack();
    } catch (err) {
      const msg = extractErrMessage(err) || "Failed to submit.";
      Alert.alert("Error", msg);
    }
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
    })
  }

  if (!postType) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "white", marginTop: 10 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <FlatList
            data={[{}]}
            keyExtractor={(_, i) => i.toString()}
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
                  />
                )}
                {postType !== "invite" && (
                  <>
                    <PostExtrasRow
                      taggedUsers={taggedUsers}
                      selectedPhotos={selectedPhotos}
                      onOpenTagModal={() => setTagFriendsModalVisible(true)}
                      onOpenCamera={openCamera}
                      onOpenLibrary={handlePhotoAlbumSelection}
                    />
                    <TaggedFriendsPreview
                      taggedUsers={taggedUsers}
                      onOpenTagModal={() => setTagFriendsModalVisible(true)}
                    />
                    <MediaPreview
                      selectedPhotos={selectedPhotos}
                      onOpenPhotoDetails={handleOpenPhotoDetails}
                      onOpenEditPhotos={() => setEditPhotosModalVisible(true)}
                    />
                    <SubmitButton
                      label={!isEditing ? "Post" : "Save changes"}
                      onPress={handleSubmit}
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
                {postType !== "invite" && !isRecap && (
                  <View style={{ zIndex: 999, position: "relative" }}>
                    <Autocomplete
                      ref={googlePlacesRef}
                      onPlaceSelected={setBusiness}
                      types={"establishment"}
                    />
                  </View>
                )}
              </>
            }
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 140,
              marginTop: 120,
            }}
            keyboardShouldPersistTaps="handled"
          />
        </TouchableWithoutFeedback>
        {/* Modals */}
        <TagFriendsModal
          visible={tagFriendsModalVisible}
          onSave={setTaggedUsers}
          onClose={() => setTagFriendsModalVisible(false)}
          initialSelectedFriends={taggedUsers}
          isTagging={true}
        />
        <EditPhotosModal
          visible={editPhotosModalVisible}
          photos={selectedPhotos}
          onSave={setSelectedPhotos}
          photoList={photoList}
          setPhotoList={setPhotoList}
          onClose={() => setEditPhotosModalVisible(false)}
          onDelete={handlePhotoDelete}
        />
        {previewPhoto && (
          <EditPhotoDetailsModal
            visible={photoDetailsEditing}
            photo={previewPhoto}
            onClose={handleClosePhotoDetails}
            onSave={handlePhotoSave}
            setPhotoList={setPhotoList}
            setSelectedPhotos={setSelectedPhotos}
            onDelete={handlePhotoDelete}
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
  lockedLocationNotice: {
    marginTop: 6,
  },
  lockedLocationText: {
    fontSize: 12,
    color: "#6B7280",
  },
});
