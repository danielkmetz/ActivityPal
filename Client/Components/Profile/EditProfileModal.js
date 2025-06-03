import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSelector, useDispatch } from "react-redux";
import { selectIsBusiness, selectUser } from "../../Slices/UserSlice";
import {
  uploadLogo,
  selectLogo,
  uploadBanner,
  selectBanner,
  uploadPhotos,
  selectPhotos,
  selectProfilePic,
  uploadProfilePic,
  uploadUserBanner,
  selectBusinessBanner,
} from "../../Slices/PhotosSlice"; // Import your thunks
import EditAboutInfoModal from "./EditAboutInfoModal";
import EditPhotosModal from "./EditPhotosModal";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function EditProfileModal({
  visible,
  onClose,
  aboutInfo,
  bannerPlaceholder,
  logoPlaceholder,
  profilePicPlaceholder,
}) {
  const dispatch = useDispatch();
  const isBusiness = useSelector(selectIsBusiness);
  const user = useSelector(selectUser).businessDetails;
  const generalUser = useSelector(selectUser);
  const logo = useSelector(selectLogo);
  const profilePic = useSelector(selectProfilePic);
  const banner = useSelector(selectBanner);
  const [editAboutModalVisible, setEditAboutModalVisible] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
  const [photoList, setPhotoList] = useState([]);
  const translateX = useRef(new Animated.Value(0)).current;

  const placeId = user?.placeId;
  const userId = generalUser?.id;
  const fullName = `${user?.firstName} ${user?.lastName}`;
  const bannerUrl = typeof banner === 'string'
    ? banner
    : banner?.presignedUrl || banner?.url;

  // Update photoList whenever photos prop changes
  useEffect(() => {
    if (selectedPhotos) {
      setPhotoList(selectedPhotos);
    }
  }, [selectedPhotos]);

  console.log(banner)

  const handleOpenEditAboutModal = () => {
    Animated.timing(translateX, {
      toValue: -SCREEN_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setEditAboutModalVisible(true);
    });
  };

  const handleCloseEditAboutModal = () => {
    setEditAboutModalVisible(false);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleLogoSelection = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      const name = uri.split('/').pop();
      const extension = name.split('.').pop().toLowerCase(); // Extract file extension

      // Map extensions to MIME types
      const mimeTypeMap = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
      };

      const file = {
        uri,
        name,
        type: mimeTypeMap[extension] || 'application/octet-stream', // Default to octet-stream if unknown
      };

      dispatch(uploadLogo({ placeId, file }))
        .unwrap()
        .then(() => {
          console.log('Logo uploaded successfully');
          // No need to manually update `currentLogo` since Redux state handles this now
        })
        .catch((error) => {
          console.error('Error uploading logo:', error);
        });
    }
  };

  const handleBannerSelection = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType,
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      const name = uri.split('/').pop();
      const extension = name.split('.').pop().toLowerCase(); // Extract file extension

      // Map extensions to MIME types
      const mimeTypeMap = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
      };

      const file = {
        uri,
        name,
        type: mimeTypeMap[extension] || 'application/octet-stream', // Default to octet-stream if unknown
      };

      dispatch(isBusiness ? uploadBanner({ placeId, file }) : uploadUserBanner({ userId, file }))
        .unwrap()
        .then(() => {
          console.log('Banner uploaded successfully');
          // No need to manually update `currentLogo` since Redux state handles this now
        })
        .catch((error) => {
          console.error('Error uploading logo:', error);
        });
    }
  };

  // Handle profile picture selection and upload
  const handleProfilePicSelection = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType,
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled) {
        const selectedFile = {
          uri: result.assets[0].uri,
          name: result.assets[0].uri.split('/').pop(),
          type: result.assets[0].type || 'image/jpeg',
          uploadedBy: fullName,
          description: '',
          tags: [],
        };

        await dispatch(uploadProfilePic({ userId, file: selectedFile }));
      }
    } catch (error) {
      console.error('Error selecting or uploading profile picture:', error);
    }
  };

  const handlePhotoAlbumSelection = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled) {
      const files = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.uri.split("/").pop(),
        type: asset.type || "image/jpeg",
        description: "",
        tags: [],
      }));

      setSelectedPhotos(files);
      setEditPhotosModalVisible(true);
    }
  };

  const handleSavePhotos = (updatedPhotos) => {
    dispatch(uploadPhotos({ placeId, files: updatedPhotos }));
  };

  const modalStyle = {
    transform: [{ translateX }],
  };

  return (
    <Modal
      animationType="slide"
      visible={visible}
      transparent={false}
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.animatedContainer, modalStyle]}>
        <ScrollView contentContainerStyle={styles.modalContainer}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="black" />
          </TouchableOpacity>

          {/* Section for Current Banner */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Banner Image</Text>
            {isBusiness ?
              <Image
                source={bannerUrl ? { uri: bannerUrl } : bannerPlaceholder}
                style={styles.previewImage}
              /> : (
                banner?.url ? (
                  <Image source={{ uri: banner.url }} style={styles.previewImage} />
                ) : (
                  <View style={[styles.previewImage, styles.bannerPlaceholder]}>
                    <Text style={styles.bannerPlaceholderText}>Upload a banner</Text>
                  </View>
                )
              )}
            <TouchableOpacity style={styles.uploadButton} onPress={handleBannerSelection}>
              <Text style={styles.uploadButtonText}>Change Banner</Text>
            </TouchableOpacity>
          </View>

          {/* Section for Current Logo or profile picture */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current {isBusiness ? 'Logo' : 'Profile Picture'}</Text>
            {isBusiness ?
              <Image
                source={logo ? { uri: logo } : logoPlaceholder}
                style={styles.previewLogo}
                resizeMode='contain'
              /> :
              <Image
                source={profilePic ? { uri: profilePic.url } : profilePicPlaceholder}
                style={styles.previewLogo}
                resizeMode='contain'
              />
            }
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={isBusiness ? handleLogoSelection : handleProfilePicSelection}
            >
              <Text style={styles.uploadButtonText}>Change {isBusiness ? 'Logo' : 'Profile Picture'}</Text>
            </TouchableOpacity>
          </View>

          {/* Section for About Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About Info</Text>
            <Text style={styles.label}>Address:</Text>
            <Text style={styles.infoText}>{aboutInfo.address}</Text>
            <Text style={styles.label}>Phone:</Text>
            <Text style={styles.infoText}>{aboutInfo.phone}</Text>
            <Text style={styles.label}>Description:</Text>
            <Text style={styles.infoText}>{aboutInfo.description}</Text>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={handleOpenEditAboutModal}
            >
              <Text style={styles.uploadButtonText}>Edit About Info</Text>
            </TouchableOpacity>
          </View>

          {/* Section for Adding Photos */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add Photos</Text>
            <View style={styles.photoGrid}>
              {selectedPhotos?.map((photo, index) => (
                <Image
                  key={index}
                  source={{ uri: photo.uri }}
                  style={styles.photoThumbnail}
                />
              ))}
            </View>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={handlePhotoAlbumSelection}
            >
              <Text style={styles.uploadButtonText}>Add Photos</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Edit About Info Modal */}
      <EditAboutInfoModal
        visible={editAboutModalVisible}
        onClose={handleCloseEditAboutModal}
        aboutInfo={aboutInfo}
        placeId={placeId}
      />

      {/* Edit photos modal */}
      <EditPhotosModal
        visible={editPhotosModalVisible}
        photos={selectedPhotos}
        onSave={handleSavePhotos}
        onClose={() => setEditPhotosModalVisible(false)}
        photoList={photoList}
        setPhotoList={setPhotoList}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  animatedContainer: {
    flex: 1,
  },
  modalContainer: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  closeButton: {
    alignSelf: "flex-end",
    padding: 10,
    marginTop: 20,
  },
  section: {
    marginVertical: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  previewImage: {
    width: "100%",
    height: 200,
    resizeMode: "cover",
    borderRadius: 8,
    marginBottom: 10,
  },
  previewLogo: {
    width: 160,
    height: 160,
    borderRadius: 75,
    borderWidth: 5,
    borderColor: "#fff",
    alignSelf: "center",
    padding: 10,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  photoThumbnail: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: "#f0f0f0",
  },
  uploadButton: {
    backgroundColor: "#388E3C",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  uploadButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginVertical: 5,
  },
  infoText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 10,
  },
  bannerPlaceholder: {
    backgroundColor: "teal",
    justifyContent: "center",
    alignItems: "center",
  },
  bannerPlaceholderText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
});
