import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import EditPhotosModal from "../../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../../Profile/EditPhotoDetailsModal";

/**
 * Props:
 * - initialPhotos: normalized photos array ([{ uri, photoKey?, description?, taggedUsers? }])
 * - onChangeSelectedPhotos: (photos[]) => void   // called whenever selectedPhotos changes
 * - isPromotion: boolean (optional)              // forwarded to modals, defaults to false
 */
export default function PhotosSection({
  initialPhotos = [],
  onChangeSelectedPhotos,
  isPromotion = false,
}) {
  const [photoList, setPhotoList] = useState(initialPhotos);
  const [selectedPhotos, setSelectedPhotos] = useState(initialPhotos);
  const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
  const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // keep internal state in sync when parent hydrates with a new event’s photos
  useEffect(() => {
    setPhotoList(initialPhotos);
    setSelectedPhotos(initialPhotos);
  }, [Array.isArray(initialPhotos) ? initialPhotos.map(p => p?.photoKey || p?.uri).join("|") : ""]);

  // bubble changes to parent whenever selectedPhotos changes
  useEffect(() => {
    onChangeSelectedPhotos && onChangeSelectedPhotos(selectedPhotos);
  }, [selectedPhotos]);

  const handleSavePhotos = (updatedPhotos) => {
    setSelectedPhotos(updatedPhotos);
    setEditPhotosModalVisible(false);
  };

  const handlePhotoSave = (updatedPhoto) => {
    // update both lists by matching on uri (fallback to photoKey)
    const match = (a, b) => (a?.uri && b?.uri ? a.uri === b.uri : a?.photoKey && b?.photoKey ? a.photoKey === b.photoKey : false);

    setPhotoList((prev) => prev.map((p) => (match(p, updatedPhoto) ? updatedPhoto : p)));
    setSelectedPhotos((prev) => prev.map((p) => (match(p, updatedPhoto) ? updatedPhoto : p)));
  };

  const handlePickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      // keep this aligned with your existing usage
      mediaTypes: ImagePicker.MediaType, // if you prefer: ImagePicker.MediaTypeOptions.All
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled) {
      const newFiles = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.uri.split("/").pop(),
        type: asset.type || "image/jpeg",
        description: "",
        taggedUsers: [],
      }));
      setSelectedPhotos((prev) => [...prev, ...newFiles]);
      setEditPhotosModalVisible(true);
    }
  };

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.sectionTitle}>Photos</Text>
      <ScrollView horizontal style={styles.photoRow}>
        {photoList.map((photo, idx) => (
          <TouchableOpacity
            key={(photo.photoKey || photo.uri || idx).toString()}
            onPress={() => {
              setPreviewPhoto(photo);
              setPhotoDetailsEditing(true);
            }}
          >
            <Image source={{ uri: photo.uri }} style={styles.photo} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.button} onPress={handlePickFromLibrary}>
        <Text style={styles.buttonText}>Add Event Photos</Text>
      </TouchableOpacity>
      <EditPhotosModal
        visible={editPhotosModalVisible}
        photos={selectedPhotos}
        onSave={handleSavePhotos}
        photoList={photoList}
        setPhotoList={setPhotoList}
        onClose={() => setEditPhotosModalVisible(false)}
        isPromotion={isPromotion}
      />
      {previewPhoto && (
        <EditPhotoDetailsModal
          visible={photoDetailsEditing}
          photo={previewPhoto}
          onClose={() => setPhotoDetailsEditing(false)}
          onSave={handlePhotoSave}
          setPhotoList={setPhotoList}
          setSelectedPhotos={setSelectedPhotos}
          isPromotion={isPromotion}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#ccc",
    paddingBottom: 4,
  },
  photoRow: { flexDirection: "row", marginTop: 10 },
  photo: { width: 80, height: 80, borderRadius: 10, marginRight: 10 },
  button: { backgroundColor: "#008080", padding: 12, borderRadius: 10, alignItems: "center", marginTop: 10 },
  buttonText: { color: "white", fontWeight: "bold" },
});
