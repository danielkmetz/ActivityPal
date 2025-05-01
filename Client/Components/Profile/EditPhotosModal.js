import React, { useState, useEffect } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, Modal, ScrollView, Dimensions } from "react-native";
import EditPhotoDetailsModal from "./EditPhotoDetailsModal";

const { width: screenWidth } = Dimensions.get("window");
const columnWidth = (screenWidth) / 3; // 40 for padding/margin adjustments

export default function EditPhotosModal({ visible, photos, onSave, onClose, photoList, setPhotoList, isPromotion }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  // Update photoList whenever photos prop changes
  useEffect(() => {
    if (photos) {
      setPhotoList(photos);
    }
  }, [photos]);

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo);
    setDetailsModalVisible(true);
  };

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList((prev) =>
      prev.map((photo) => {
        const isSamePhoto =
          (photo._id && updatedPhoto._id && photo._id === updatedPhoto._id) ||
          (photo.photoKey && updatedPhoto.photoKey && photo.photoKey === updatedPhoto.photoKey) ||
          (photo.uri && updatedPhoto.uri && photo.uri === updatedPhoto.uri);
  
        return isSamePhoto ? updatedPhoto : photo;
      })
    );
  };  

  const handleSavePhotos = () => {
    // Use a Map to de-duplicate and merge based on uri or photoKey
    const mergedMap = new Map();
  
    // Add all current photos (original)
    photos.forEach(photo => {
      const key = photo._id || photo.photoKey || photo.uri;
      mergedMap.set(key, photo);
    });
  
    // Overwrite with updated versions from photoList (preserves edits)
    photoList.forEach(photo => {
      const key = photo._id || photo.photoKey || photo.uri;
      mergedMap.set(key, photo);
    });
  
    const merged = Array.from(mergedMap.values());
    onSave(merged);
    onClose();
  };  

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={styles.title}>Edit Photos</Text>
          <View style={styles.photoGrid}>
            {photoList?.map((photo, index) => (
              <TouchableOpacity key={index} onPress={() => handlePhotoClick(photo)}>
                <Image source={{ uri: photo.uri || photo.url }} style={styles.photoThumbnail} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Button Container Positioned at the Bottom */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSavePhotos}>
            <Text style={styles.saveButtonText}>Save Photos</Text>
          </TouchableOpacity>
        </View>

        {/* Edit Photo Details Modal */}
        <EditPhotoDetailsModal
          visible={detailsModalVisible}
          photo={selectedPhoto}
          onSave={handlePhotoSave}
          onClose={() => setDetailsModalVisible(false)}
          isPromotion={isPromotion}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    marginTop: 85,
  },
  scrollContainer: {
    paddingBottom: 100, // Leave space for the button container
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  photoThumbnail: {
    width: columnWidth,
    height: columnWidth,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: "#f0f0f0",
  },
  buttonContainer: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    marginBottom: 30,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#888",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
    marginRight: 10,
  },
  cancelButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "teal",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
    marginLeft: 10,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
