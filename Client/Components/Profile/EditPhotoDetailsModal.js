import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";

export default function EditPhotoDetailsModal({ visible, photo, onSave, onClose }) {
  const [description, setDescription] = useState(photo?.description || "");
  const [tags, setTags] = useState(photo?.tags?.join(", ") || "");

  // Sync state with the current photo
  useEffect(() => {
    setDescription(photo?.description || "");
    setTags(photo?.tags?.join(", ") || "");
  }, [photo]);

  const handleSave = () => {
    onSave({
      ...photo,
      description,
      tags: tags.split(",").map((tag) => tag.trim()),
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.contentWrapper}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>Edit Photo</Text>
            {/* Photo Preview */}
            {photo?.uri && (
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
            )}
            {/* Description Section */}
            <Text style={styles.caption}>Description</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
            />

            {/* Tags Section */}
            <Text style={styles.caption}>Tags (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={tags}
              onChangeText={setTags}
            />

            {/* Save and Cancel Buttons */}
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  contentWrapper: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
  },
  content: {
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  photoPreview: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
    resizeMode: "cover",
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#f9f9f9",
  },
  saveButton: {
    backgroundColor: "teal",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
    width: "100%",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  cancelButton: {
    alignItems: "center",
    width: "100%",
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: "#888",
    fontWeight: "bold",
  },
  caption: {
    width: "100%",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 5,
    color: "#333",
  },
});
