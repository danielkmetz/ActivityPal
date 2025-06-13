import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useDispatch } from "react-redux";
import { updateBusinessInfo } from "../../Slices/UserSlice";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function EditAboutInfoModal({ visible, onClose, aboutInfo, placeId }) {
  const dispatch = useDispatch();

  // Local state for form fields
  const [address, setAddress] = useState(aboutInfo.address || "");
  const [phone, setPhone] = useState(
    aboutInfo.phone === "Enter a phone number" ? "" : aboutInfo.phone);
  const [description, setDescription] = useState(
    aboutInfo.description === "Enter a description of your business" ? "" : aboutInfo.description);

  // Shared value for modal animation
  const translateX = useSharedValue(SCREEN_WIDTH);

  // Animate modal when `visible` changes
  useEffect(() => {
    if (visible) {
      translateX.value = 0; // Slide in
    } else {
      translateX.value = SCREEN_WIDTH; // Slide out
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(translateX.value, { duration: 200 }) }],
  }));

  // Handle save button press
  const handleSave = () => {
    const updatedInfo = {
      placeId,
      location: address,
      phone,
      description,
    };

    dispatch(updateBusinessInfo(updatedInfo))
      .unwrap()
      .then(() => {
        onClose(); // Close the modal after successful update
      })
      .catch((error) => {
        console.error("Failed to update business info:", error);
      });
  };

  // Format phone number as (123) 456-7891
  const formatPhoneNumber = (value) => {
    const cleaned = value.replace(/\D/g, "");
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    return cleaned.replace(/(\d{3})(\d{0,3})/, (_, g1, g2) => {
      if (g2) {
        return `(${g1}) ${g2}`;
      }
      return g1;
    });
  };

  return (
    <Animated.View style={[styles.modalContainer, animatedStyle]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.contentContainer}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="black" />
          </TouchableOpacity>
          <Text style={styles.title}>Edit About Info</Text>
        </View>

        {/* Edit Fields */}
        <View style={styles.content}>
          <Text style={styles.label}>Address:</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Enter your address"
            placeholderTextColor="#888"
            value={address}
            onChangeText={setAddress}
          />
          <Text style={styles.label}>Phone:</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Enter a phone number"
            placeholderTextColor="#888"
            value={phone}
            onChangeText={(value) => setPhone(formatPhoneNumber(value))}
            keyboardType="phone-pad"
          />
          <Text style={styles.label}>Description:</Text>
          <TextInput
            style={[styles.textInput, { height: 100 }]}
            multiline
            placeholder="Enter a description of your business"
            placeholderTextColor="#888"
            value={description}
            onChangeText={setDescription}
          />
          {/* Save Button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    backgroundColor: "#fff",
  },
  contentContainer: {
    flex: 1,
    backgroundColor: "#fff",
    marginTop: 80,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  backButton: {
    marginRight: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  textInput: {
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  saveButton: {
    backgroundColor: "#388E3C",
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginTop: 20,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
