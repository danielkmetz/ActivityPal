import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import TagFriendsModal from "../Reviews/TagFriendsModal";

export default function EditPhotoDetailsModal({ visible, photo, onSave, onClose, setPhotoList, isPromotion }) {
  const [description, setDescription] = useState(photo?.description || "");
  const [taggedUsers, setTaggedUsers] = useState(photo?.taggedUsers || []); // Stores {username, x, y}
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [showTagFriendsModal, setShowTagFriendsModal] = useState(false);

  useEffect(() => {
    setDescription(photo?.description || "");
    setTaggedUsers(photo?.taggedUsers || []);
  }, [photo]);

  const handleSave = () => {
    onSave({
      ...photo,
      description,
      taggedUsers,
    });
    onClose();
  };

  // Handle tap on the image to open friend tagging modal
  const handleImagePress = (event) => {
    const { locationX, locationY } = event.nativeEvent;
    setSelectedPosition({ x: locationX, y: locationY });
    setShowTagFriendsModal(true);
  };

  const handleDelete = () => {
    setPhotoList((prevList) => prevList.filter((p) => p.uri !== photo.uri)); // Remove from photoList
    onClose(); // Close modal after deletion
  };

  // Save the selected friend as a tag
  const handleTagFriend = (selectedFriends) => {
    if (selectedFriends.length > 0 && selectedPosition) {
      setTaggedUsers((prevTaggedUsers) => {
        // Create a new list that retains previously tagged users' positions
        let updatedTaggedUsers = [...prevTaggedUsers];

        selectedFriends.forEach(friend => {
          // Check if the user is already tagged
          const existingIndex = updatedTaggedUsers.findIndex(user => user._id === friend._id);

          if (existingIndex !== -1) {
            // Update the position of the already tagged user
            updatedTaggedUsers[existingIndex] = {
              ...updatedTaggedUsers[existingIndex],
              x: selectedPosition.x,
              y: selectedPosition.y,
            };
          } else {
            // Add new tagged user
            updatedTaggedUsers.push({
              username: `${friend.firstName} ${friend.lastName}`,
              _id: friend._id,
              x: selectedPosition.x,
              y: selectedPosition.y,
              profilePic: friend.presignedProfileUrl,
            });
          }
        });

        return updatedTaggedUsers; // Set the new tagged users array
      });
    }

    setShowTagFriendsModal(false);
    setSelectedPosition(null);
  };

  // Function to remove a tagged user
  const handleRemoveTag = (userToRemove) => {
    setTaggedUsers((prevTaggedUsers) =>
      prevTaggedUsers.filter(user => user._id !== userToRemove._id)
    );
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

            {/* Photo Preview with Clickable Tags */}
            {photo?.uri && (
              <View style={styles.photoContainer}>
                <ImageBackground
                  source={{ uri: photo.uri }}
                  style={styles.photoPreview}
                  onTouchEnd={!isPromotion && handleImagePress}
                >
                  {/* Render tagged friends */}
                  {taggedUsers.map((user, index) => (
                    <View
                      key={index}
                      style={[styles.tagMarker, { left: user.x, top: user.y }]}
                    >
                      <Image source={{ uri: user.profilePic }} style={styles.tagProfilePic} />
                      <Text style={styles.tagText}>{user.username}</Text>
                    </View>
                  ))}
                </ImageBackground>
              </View>
            )}

            {/* Description Section */}
            <Text style={styles.caption}>Description</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
            />

            {/* Tagged Users Section */}
            {!isPromotion && (
              <>
              <Text style={styles.caption}>Tagged Friends</Text>
              <View style={styles.tagsList}>
                {taggedUsers.map((user, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.tagItem}
                    onPress={() => handleRemoveTag(user)} // Remove tag when clicked
                  >
                    <Text style={styles.tagText}>{user.username}</Text>
                    <Text style={styles.removeTag}> ❌ </Text>
                  </TouchableOpacity>
                ))}
              </View>
              </>  
            )}
            
            {/* Save and Cancel Buttons */}
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Friend Tagging Modal */}
      <TagFriendsModal
        visible={showTagFriendsModal}
        onClose={() => setShowTagFriendsModal(false)}
        onSave={handleTagFriend}
        isPhotoTagging={true}
      />
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
    height: '90%',
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
    marginTop: 100,
  },
  content: {
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  photoContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  photoPreview: {
    width: "100%",
    height: 300,
    borderRadius: 10,
    resizeMode: "cover",
    justifyContent: "flex-start",
  },
  tagMarker: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    padding: 5,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  tagProfilePic: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 5,
  },
  tagText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
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
    marginTop: 25,
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
  tagsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  tagItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ddd",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    marginRight: 5,
  },
  removeTag: {
    color: "red",
    fontSize: 10,
    fontWeight: "bold",
  },
});
