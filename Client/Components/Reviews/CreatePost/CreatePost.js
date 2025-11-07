import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
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
import InviteForm from "../../ActivityInvites/InviteForm";
import SectionHeader from '../SectionHeader'
import Autocomplete from "../../Location/Autocomplete";
import PostTypeToggle from "./PostTypeToggle";
import ReviewForm from "./ReviewForm";
import TaggedFriendsSection from "./TaggedFriendsSection";
import SelectedMediaSection from "./SelectMediaSection";
import SubmitButton from "./SubmitButton";

export default function CreatePost() {
  const navigation = useNavigation();
  const route = useRoute();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const [business, setBusiness] = useState(null);
  const [rating, setRating] = useState(3);
  const [review, setReview] = useState("");
  const [checkInMessage, setCheckInMessage] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [photoList, setPhotoList] = useState([]);
  const [taggedUsers, setTaggedUsers] = useState([]);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
  const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
  const [tagFriendsModalVisible, setTagFriendsModalVisible] = useState(false);
  const [priceRating, setPriceRating] = useState(null); // 1–4
  const [atmosphereRating, setAtmosphereRating] = useState(3); // 1–5
  const [serviceRating, setServiceRating] = useState(3); // 1–5
  const [wouldRecommend, setWouldRecommend] = useState(true);

  const isEditing = route.params?.isEditing || false;
  const initialPost = route.params?.initialPost || null;
  const googlePlacesRef = useRef(null);
  const fullName = `${user.firstName} ${user?.lastName}`;

  const initialType = route.params?.isEditing
    ? route.params?.initialPost?.type
    : route.params?.postType;
  const [postType, setPostType] = useState(initialType);
  
  useEffect(() => {
    if (isEditing && initialPost) {
      //setPostType(initialPost.type); // "review" or "check-in"
      setReview(initialPost.message || "");
      setCheckInMessage(initialPost.message || "");
      setTaggedUsers(initialPost.taggedUsers || []);
      setSelectedPhotos(initialPost.media || []);
      setPhotoList(initialPost.media || []);
      setPriceRating(initialPost.details?.priceRating || null);
      setServiceRating(initialPost.details?.serviceRating || 3);
      setAtmosphereRating(initialPost.details?.atmosphereRating || 3);
      setWouldRecommend(initialPost.details?.wouldRecommend || true);
      setBusiness({
        place_id: initialPost.placeId,
        name: initialPost.businessName,
        formatted_address: initialPost.location || "",
      });
      setRating(initialPost.details?.rating || 3);

      if (initialPost.businessName) {
        googlePlacesRef.current?.setAddressText(`${initialPost.businessName}`);
      }
    }
  }, [isEditing, initialPost]);

  useEffect(() => {
    setPhotoList(selectedPhotos);
  }, [selectedPhotos]);

  const handlePhotoAlbumSelection = async () => {
    const newFiles = await selectMediaFromGallery();

    if (newFiles.length > 0) {
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

      const ordered = deduped.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      setSelectedPhotos(ordered);
      setPhotoList(ordered);
      setEditPhotosModalVisible(true);
      setPreviewPhoto(null);
    }
  };

  const getPhotoKey = (p) => p.photoKey || p.localKey || p.uri || p._id;

  const replaceInPlace = (list, updated) => {
    const k = getPhotoKey(updated);
    const idx = list.findIndex(p => getPhotoKey(p) === k);
    if (idx === -1) return list; // not found, no change
    const next = list.slice();
    next[idx] = { ...list[idx], ...updated };
    return next;
  };

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList(prev => replaceInPlace(prev, updatedPhoto));
    setSelectedPhotos(prev => replaceInPlace(prev, updatedPhoto));
  };

  const handlePhotoDelete = (photoToDelete) => {
    setSelectedPhotos((prev) =>
      prev.filter((photo) => {
        const matchById = photo._id && photoToDelete._id && photo._id === photoToDelete._id;
        const matchByKey = photo.photoKey && photoToDelete.photoKey && photo.photoKey === photoToDelete.photoKey;
        const matchByUri = photo.uri && photoToDelete.uri && photo.uri === photoToDelete.uri;
        return !(matchById || matchByKey || matchByUri);
      })
    );
    setPhotoDetailsEditing(false); // close modal after deletion
  };

  // ------------ helpers -------------
  const normalizeId = (u) => u?._id || u?.userId || u?.id;

  const uploadDedupPhotos = async ({ dispatch, userId, placeId, photos }) => {
    if (!Array.isArray(photos) || photos.length === 0) return [];
    const seen = new Set();
    const deduped = [];
    for (const p of photos) {
      const k = p.photoKey || p.uri || p.localKey || JSON.stringify(p);
      if (!seen.has(k)) { seen.add(k); deduped.push(p); }
    }
    return handlePhotoUpload({ dispatch, userId, placeId, photos: deduped });
  };

  const notifyAll = async ({
    dispatch, fullName, currentUserId, placeId, businessName,
    postType, postId, taggedUsers, uploadedPhotos,
  }) => {
    const postTagPromises = (taggedUsers || []).map((tu) =>
      dispatch(createNotification({
        userId: normalizeId(tu),
        type: "tag",
        message: `${fullName} tagged you in a ${postType}!`,
        relatedId: currentUserId,
        typeRef: "User",
        targetId: postId,
        postType,
      }))
    );

    const photoTagPromises = (uploadedPhotos || []).flatMap((photo) =>
      (photo.taggedUsers || []).map((u) =>
        dispatch(createNotification({
          userId: normalizeId(u),
          type: "photoTag",
          message: `${fullName} tagged you in a photo!`,
          relatedId: currentUserId,
          typeRef: "User",
          targetId: postId,
          postType,
        }))
      )
    );

    const businessPromise = dispatch(createBusinessNotification({
      placeId,
      postType,
      type: postType,
      message: `${fullName} ${postType === "review" ? "left a review on" : "checked in at"} ${businessName}`,
      relatedId: currentUserId,
      typeRef: "User",
      targetId: postId,
      targetRef: "Post",
    }));

    return Promise.all([...postTagPromises, ...photoTagPromises, businessPromise]);
  };

  // ------------ main ---------------
  const handleSubmit = async () => {
    const isReview = postType === "review";
    const trimmedReview = (review || "").trim();
    const trimmedCheckIn = (checkInMessage || "").trim();

    if (!business || (isReview && !trimmedReview)) {
      Alert.alert("Error", "Please fill in all required fields.");
      return;
    }

    try {
      const currentUserId = user?.id || user?._id;
      const placeId = business.place_id;
      const businessName = business.name || "";
      const location = business.formatted_address || "";
      const rawPhotos = (Array.isArray(photoList) && photoList.length > 0 ? photoList : selectedPhotos) || [];

      // 1) upload photos (deduped)
      const uploadedPhotos = await uploadDedupPhotos({
        dispatch, userId: currentUserId, placeId, photos: rawPhotos,
      });

      // 2) common fields
      const taggedUserIds = (taggedUsers || []).map(normalizeId).filter(Boolean);
      let postId;

      // 3) edit vs create
      if (isEditing && initialPost) {
        const base = { placeId, taggedUsers: taggedUserIds, photos: uploadedPhotos };
        const updates = isReview
          ? {
            ...base,
            // details for reviews
            rating, priceRating, serviceRating, atmosphereRating, wouldRecommend,
            reviewText: trimmedReview,           // your backend maps reviewText/message
            message: trimmedReview,              // keep both for safety
          }
          : { ...base, message: trimmedCheckIn || null };

        await dispatch(updatePost({ postId: initialPost._id, updates })).unwrap();
        postId = initialPost._id;

        Alert.alert("Success", `Your ${postType} has been updated!`);
      } else {
        // unified create payload: single shape for any type
        const payload = {
          type: postType,                  // backend can use this for /posts or ignore if path-param based
          userId: currentUserId,
          placeId,
          location,
          businessName,
          photos: uploadedPhotos,
          taggedUsers: taggedUserIds,      // backend will extract ids if objects are passed
          // message + type-specific fields:
          ...(isReview
            ? {
              message: trimmedReview,    // server prefers message; also honors reviewText
              reviewText: trimmedReview,
              rating, priceRating, serviceRating, atmosphereRating, wouldRecommend,
            }
            : { message: trimmedCheckIn || null }),
        };

        const created = await dispatch(createPost(payload)).unwrap();
        postId = created._id;

        Alert.alert("Success", `Your ${postType} has been posted!`);
      }

      // 4) notifications
      await notifyAll({
        dispatch,
        fullName,
        currentUserId,
        placeId,
        businessName,
        postType,
        postId,
        taggedUsers,      // use original array so post-level tags still notify even if you sent ids
        uploadedPhotos,
      });

      navigation.goBack();
    } catch (err) {
      Alert.alert("Error", err?.message || "Failed to submit.");
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

  if (!postType) {
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'white', marginTop: 10, }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <FlatList
            data={[{}]} // dummy item to drive the layout
            keyExtractor={(_, i) => i.toString()}
            renderItem={() => (
              <>
                {/* Main body content here */}
                {postType === "review" && (
                  <ReviewForm
                    rating={rating}
                    setRating={setRating}
                    priceRating={priceRating}
                    setPriceRating={setPriceRating}
                    serviceRating={serviceRating}
                    setServiceRating={setServiceRating}
                    atmosphereRating={atmosphereRating}
                    setAtmosphereRating={setAtmosphereRating}
                    wouldRecommend={wouldRecommend}
                    setWouldRecommend={setWouldRecommend}
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
                    <TaggedFriendsSection taggedUsers={taggedUsers} onOpenTagModal={() => setTagFriendsModalVisible(true)} />
                    <SelectedMediaSection
                      selectedPhotos={selectedPhotos}
                      onOpenCamera={() => navigation.navigate('CameraScreen')}
                      onOpenLibrary={handlePhotoAlbumSelection}
                      onOpenTagModal={() => setTagFriendsModalVisible(true)}
                      onOpenPhotoDetails={handleOpenPhotoDetails}
                    />
                    <SubmitButton label={!isEditing ? 'Post' : 'Save changes'} onPress={handleSubmit} />
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
                    onLivePress={() => navigation.navigate('GoLive')}
                  />
                )}
                {postType !== "invite" && (
                  <View style={{ zIndex: 999, position: 'relative' }}>
                    <Autocomplete
                      ref={googlePlacesRef}
                      onPlaceSelected={setBusiness}
                      types={"establishment"}
                    />
                  </View>
                )}
              </>
            }
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, marginTop: 120 }}
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
});
