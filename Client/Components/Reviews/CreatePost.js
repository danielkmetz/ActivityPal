import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { FontAwesome, AntDesign } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import { Rating } from "react-native-ratings";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import EditPhotosModal from "../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../Profile/EditPhotoDetailsModal";
import TagFriendsModal from "./TagFriendsModal";
import VideoThumbnail from "./VideoThumbnail";
import { selectUser } from "../../Slices/UserSlice";
import { editReview } from "../../Slices/ReviewsSlice";
import { createReview } from "../../Slices/ReviewsSlice";
import { createCheckIn, editCheckIn } from "../../Slices/CheckInsSlice";
import { createNotification } from "../../Slices/NotificationsSlice";
import { createBusinessNotification } from "../../Slices/BusNotificationsSlice";
import { selectMediaFromGallery } from "../../utils/selectPhotos";
import { googlePlacesDefaultProps } from "../../utils/googleplacesDefaults";
import { handlePhotoUpload } from "../../utils/photoUploadHelper";
import { isVideo } from "../../utils/isVideo";
import PriceRating from "./metricRatings/PriceRating";
import AtmosphereRating from "./metricRatings/AtmosphereRating";
import ServiceSlider from "./metricRatings/ServiceSlider";
import WouldRecommend from "./metricRatings/WouldRecommend";
import InviteForm from "../ActivityInvites/InviteForm";
import FriendPills from './FriendPills';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;

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
  const userId = user.id;

  const initialType = route.params?.isEditing
    ? route.params?.initialPost?.type
    : route.params?.postType;
  const [postType, setPostType] = useState(initialType);

  useEffect(() => {
    if (isEditing && initialPost) {
      //setPostType(initialPost.type); // "review" or "check-in"
      setReview(initialPost.reviewText || "");
      setCheckInMessage(initialPost.message || "");
      setTaggedUsers(initialPost.taggedUsers || []);
      setSelectedPhotos(initialPost.photos || []);
      setPhotoList(initialPost.photos || []);
      setPriceRating(initialPost.priceRating || null);
      setServiceRating(initialPost.serviceRating || 3);
      setAtmosphereRating(initialPost.atmosphereRating || 3);
      setWouldRecommend(initialPost.wouldRecommend || true);
      setBusiness({
        place_id: initialPost.placeId,
        name: initialPost.businessName,
        formatted_address: initialPost.location || "",
      });
      setRating(initialPost.rating || 3);

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
      const prepared = newFiles.map(file => ({
        ...file,
        taggedUsers: [],
        description: file.description || "",
        uri: file.uri,
      }));

      const seen = new Set();
      const combined = [...photoList, ...prepared].filter(photo => {
        const key = photo.photoKey || photo.uri || photo.localKey;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setSelectedPhotos(combined);
      setPhotoList(combined);
      setEditPhotosModalVisible(true);
      setPreviewPhoto(null);
    }
  };

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList((prev) => {
      const keyToMatch = updatedPhoto.photoKey || updatedPhoto.uri || updatedPhoto._id;
      const filtered = prev.filter(photo => {
        const key = photo.photoKey || photo.uri || photo._id;
        return key !== keyToMatch;
      });
      return [...filtered, updatedPhoto];
    });
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

  const handleSubmit = async () => {
    if (!business || (postType === "review" && !review.trim())) {
      Alert.alert("Error", "Please fill in all required fields.");
      return;
    }

    try {
      let uploadedPhotos = [];

      if (selectedPhotos.length > 0) {
        const dedupedPhotos = [];
        const seenKeys = new Set();

        for (const photo of photoList) {
          const key = photo.photoKey || photo.uri || photo.localKey;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dedupedPhotos.push(photo);
          }
        }
        uploadedPhotos = await handlePhotoUpload({
          dispatch,
          userId: user.id,
          placeId: business.place_id,
          photos: photoList,
        });
      }

      let postId = null;

      if (isEditing && initialPost) {
        if (postType === "review") {
          await dispatch(
            editReview({
              placeId: business.place_id,
              reviewId: initialPost._id,
              rating,
              priceRating,
              serviceRating,
              atmosphereRating,
              wouldRecommend,
              reviewText: review.trim(),
              taggedUsers,
              photos: uploadedPhotos,
            })
          ).unwrap();
          postId = initialPost._id;
        } else {
          const taggedUserIds = taggedUsers.map(friend => friend._id || friend.userId || friend.id);
          await dispatch(
            editCheckIn({
              userId,
              checkInId: initialPost._id,
              updatedData: {
                message: checkInMessage.trim(),
                taggedUsers: taggedUserIds,
                photos: uploadedPhotos,
                placeId: business.place_id,
              },
            })
          ).unwrap();
          postId = initialPost._id;
        }

        Alert.alert("Success", `Your ${postType} has been updated!`);
        navigation.goBack();
        return;
      }

      if (postType === "review") {
        const reviewResponse = await dispatch(
          createReview({
            placeId: business.place_id,
            businessName: business.name,
            userId,
            fullName,
            rating,
            priceRating,
            serviceRating,
            atmosphereRating,
            wouldRecommend,
            reviewText: review.trim(),
            photos: uploadedPhotos,
            taggedUsers,
          })
        ).unwrap();
        postId = reviewResponse._id;
      } else {
        const taggedUserIds = taggedUsers.map(friend => friend._id || friend.userId || friend.id);
        const checkInResponse = await dispatch(
          createCheckIn({
            placeId: business.place_id,
            location: business.formatted_address,
            businessName: business.name,
            userId,
            fullName,
            message: checkInMessage.trim() || null,
            taggedUsers: taggedUserIds,
            photos: uploadedPhotos,
          })
        ).unwrap();
        postId = checkInResponse._id;
      }

      await Promise.all([
        ...taggedUsers.map(user =>
          dispatch(createNotification({
            userId: user._id || user.userId,
            type: "tag",
            message: `${fullName} tagged you in a ${postType}!`,
            relatedId: userId,
            typeRef: "User",
            targetId: postId,
            postType,
          }))
        ),
        ...uploadedPhotos.flatMap(photo =>
          photo.taggedUsers.map(user =>
            dispatch(createNotification({
              userId: user.userId,
              type: "photoTag",
              message: `${fullName} tagged you in a photo!`,
              relatedId: userId,
              typeRef: "User",
              targetId: postId,
              postType,
            }))
          )
        ),
        dispatch(createBusinessNotification({
          placeId: business.place_id,
          postType,
          type: postType,
          message: `${fullName} ${postType === "review" ? "left a review on" : "checked in at"} ${business.name}`,
          relatedId: userId,
          typeRef: "User",
          targetId: postId,
          targetRef: "Review",
        })),
      ]);

      Alert.alert("Success", `Your ${postType} has been posted!`);
      navigation.goBack();
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to submit.");
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
                  <>
                    <View style={styles.ratings}>
                      <View style={{ alignItems: 'flex-start', marginBottom: 5, }}>
                        <Text style={[styles.label, {marginRight: 5}]}>Overall</Text>
                        <Rating count={5} startingValue={rating} onFinishRating={setRating} imageSize={30} />
                      </View>
                      <View style={styles.metricCard}>
                        <Text style={styles.metricTitle}>Rate Specifics</Text>
                        <PriceRating value={priceRating} onChange={setPriceRating} />
                        <ServiceSlider value={serviceRating} onChange={setServiceRating} />
                        <AtmosphereRating value={atmosphereRating} onChange={setAtmosphereRating} />
                        <WouldRecommend value={wouldRecommend} onChange={setWouldRecommend} />
                      </View>
                    </View>
                    <Text style={styles.label}>Your Review</Text>
                    <TextInput
                      style={styles.textArea}
                      value={review}
                      onChangeText={setReview}
                      multiline
                    />
                  </>
                )}
                {postType === "check-in" && (
                  <>
                    <Text style={styles.label}>Check-in Message (optional)</Text>
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
                {selectedPhotos.length > 0 && (
                  <>
                    <Text style={styles.label}>Media</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row' }}>
                        {selectedPhotos.map((item, i) => (
                          <TouchableOpacity key={i.toString()} onPress={() => handleOpenPhotoDetails(item)}>
                            {isVideo(item) ? (
                              <VideoThumbnail file={item} width={80} height={80} />
                            ) : (
                              <Image source={{ uri: item.uri || item.url }} style={styles.media} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </>
                )}

                <Text style={styles.label}>Tagged Friends</Text>
                {taggedUsers.length > 0 ? (
                  <FriendPills friends={taggedUsers} />
                ) : (
                  <Text style={{ color: "#888", marginBottom: 10 }}>No friends tagged yet.</Text>
                )}

                {postType !== "invite" && (
                  <>
                    <View style={styles.iconActionRow}>
                      <TouchableOpacity style={styles.iconAction} onPress={() => navigation.navigate("CameraScreen")}>
                        <FontAwesome name="camera" size={24} color="black" />
                        <Text style={styles.iconLabel}>Camera</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.iconAction} onPress={handlePhotoAlbumSelection}>
                        <FontAwesome name="picture-o" size={24} color="black" />
                        <Text style={styles.iconLabel}>Library</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.iconAction} onPress={() => setTagFriendsModalVisible(true)}>
                        <AntDesign name="tag" size={24} color="black" />
                        <Text style={styles.iconLabel}>Tag</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={handleSubmit} style={styles.submitButton}>
                      <Text style={styles.submitButtonText}>{!isEditing ? 'Post' : "Save changes"}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
            ListHeaderComponent={
              <>
                {!isEditing && (
                  <View style={styles.toggleContainer}>
                    {["review", "check-in", "invite"].map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.toggleButton,
                          postType === type && styles.activeToggleButton,
                        ]}
                        onPress={() => setPostType(type)}
                      >
                        <Text
                          style={[
                            styles.toggleButtonText,
                            postType === type && styles.activeToggleButtonText,
                          ]}
                        >
                          {type === "review" ? "Review" : type === "check-in" ? "Check-in" : "Invite"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {postType !== "invite" && (
                  <View style={{ zIndex: 999, position: 'relative' }}>
                    <GooglePlacesAutocomplete
                      ref={googlePlacesRef}
                      placeholder="Search for a business"
                      fetchDetails
                      onPress={(data, details) => setBusiness(details)}
                      query={{ key: GOOGLE_API_KEY, language: "en", types: "establishment" }}
                      styles={{
                        textInput: styles.input,
                        listView: { backgroundColor: "#fff", maxHeight: 250 },
                      }}
                      {...googlePlacesDefaultProps}
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
  container: { marginTop: 20, backgroundColor: "white" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  label: { fontSize: 14, fontWeight: 500, marginVertical: 10 },
  input: {
    backgroundColor: "#f5f5f5",
    height: 50,
    borderRadius: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    fontSize: 16,
  },
  textArea: {
    height: 100,
    backgroundColor: "#fff",
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    marginBottom: 15,
    textAlignVertical: "top",
  },
  buttonRow: { flexDirection: "row", justifyContent: "space-around", marginVertical: 10 },
  button: { backgroundColor: "teal", padding: 10, borderRadius: 8 },
  buttonText: { color: "#fff", fontWeight: "bold" },
  submitButton: {
    backgroundColor: "#009999",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  toggleButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeToggleButton: {
    borderBottomColor: 'tomato',
  },
  toggleButtonText: {
    fontSize: 16,
    color: '#777',
  },
  activeToggleButtonText: {
    color: 'tomato',
    fontWeight: 'bold',
  },
  iconActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',

  },
  iconAction: {
    alignItems: 'center',
    width: 80,
    gap: 6,
  },
  iconLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    marginTop: 4,
  },
  submitButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  media: { width: 80, height: 80, marginRight: 10, borderRadius: 8 },
  metricCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
    marginBottom: 16,
    marginTop: 10,
  },
  metricTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
});
