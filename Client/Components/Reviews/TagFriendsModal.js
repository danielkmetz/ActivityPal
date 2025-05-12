import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  Pressable,
} from "react-native";
import { useSelector } from "react-redux";
import { selectFriends } from "../../Slices/friendsSlice";
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

const TagFriendsModal = ({ visible, onClose, onSave, isPhotoTagging = false, isEventInvite, initialSelectedFriends = [] }) => {
  const [selectedFriends, setSelectedFriends] = useState([]);
  const friends = useSelector(selectFriends);

  // **Reset selection if the modal is for photo tagging**
  useEffect(() => {
    if (visible) {
      if (isPhotoTagging) {
        setSelectedFriends([]);
      } else if (Array.isArray(initialSelectedFriends)) {
        const matched = friends.filter(f =>
          initialSelectedFriends.some(tagged =>
            tagged.userId === f._id || tagged._id === f._id
          )
        );
  
        setSelectedFriends(matched);
      }
    }
  }, [visible, friends]);  
  
  // Toggle selection of friends (store full object instead of just the ID)
  const toggleFriendSelection = (friend) => {
    setSelectedFriends((prevSelected) => {
      const isAlreadySelected = prevSelected.some((f) => f._id === friend._id);

      if (isAlreadySelected) {
        return prevSelected.filter((f) => f._id !== friend._id); // Remove if already selected
      } else {
        return [...prevSelected, friend]; // Add full object if not selected
      }
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>
            {!isEventInvite ? '🏷️ Tag Friends' : '📅 Invite Friends'}
          </Text>


          {/* Friend List with Profile Picture & Custom Checkboxes */}
          <FlatList
            data={friends}
            keyExtractor={(item) => item._id.toString()} // Ensure unique key
            renderItem={({ item }) => {
              const isSelected = selectedFriends.some((f) => f._id === item._id);

              return (
                <TouchableOpacity
                  style={styles.friendItem}
                  activeOpacity={0.7}
                  onPress={() => toggleFriendSelection(item)}
                >
                  {/* Profile Picture */}
                  <Image source={item.profilePicUrl ? { uri: item.profilePicUrl } : profilePicPlaceholder} style={styles.profilePic} />

                  {/* Friend Name */}
                  <Text style={styles.friendName}>
                    {item.firstName} {item.lastName}
                  </Text>

                  {/* Custom Checkbox with Bigger Clickable Area */}
                  <Pressable
                    style={[
                      styles.checkboxContainer,
                      isSelected && styles.checkedBoxContainer,
                    ]}
                    onPress={() => toggleFriendSelection(item)}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkedBox]}>
                      {isSelected && <Text style={styles.checkmark}>✔️</Text>}
                    </View>
                  </Pressable>
                </TouchableOpacity>
              );
            }}
          />

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => {
                onSave(selectedFriends); // Pass full friend objects
                onClose();
              }}
            >
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default TagFriendsModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContainer: {
    backgroundColor: "white",
    width: "100%",
    height: '100%',
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    marginTop: 55,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between", // Ensures proper alignment
    width: "100%", // Makes the item span 90% of the screen width
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  profilePic: {
    width: 40,
    height: 40,
    borderRadius: 20, // Circular profile picture
    marginRight: 10,
  },
  friendName: {
    flex: 1, // Allows text to take up remaining space
    fontSize: 16,
  },
  checkboxContainer: {
    padding: 10, // Increases clickable area
    borderRadius: 8,
  },
  checkbox: {
    width: 30, // Increase the size of the checkbox
    height: 30,
    borderWidth: 2,
    borderColor: "#888",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  checkedBox: {
    backgroundColor: "teal",
    borderColor: "teal",
  },
  checkmark: {
    color: "white",
    fontSize: 16,
  },
  buttonContainer: {
    flexDirection: "row",
    marginTop: 15,
    marginBottom: 25,
  },
  cancelButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#E57373",
    alignItems: "center",
    marginRight: 5,
  },
  saveButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#4CAF50",
    alignItems: "center",
    marginLeft: 5,
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
});
