import React from "react";
import { TextInput, TouchableOpacity, Text, Alert, StyleSheet } from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { useDispatch } from "react-redux";
import { registerUser } from "../../Slices/UserSlice";
import { googlePlacesDefaultProps } from "../../utils/googleplacesDefaults";

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;

export default function RegisterForm({ form, setForm, isBusiness, onSuccess }) {
  const dispatch = useDispatch();

  const handleRegister = () => {
    const {
      email,
      password,
      confirmPassword,
      firstName,
      lastName,
      businessName,
      location,
      placeId,
      lat,
      lng,
    } = form;

    if (!email || !password || !confirmPassword || !firstName || !lastName) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    if (isBusiness && (!businessName || !location)) {
      Alert.alert("Error", "Please fill in all business fields.");
      return;
    }

    dispatch(
      registerUser({
        email,
        password,
        firstName,
        lastName,
        isBusiness,
        businessName,
        location,
        placeId,
        lat,
        lng,
      })
    )
      .unwrap()
      .then(() => {
        Alert.alert("Success", "Registration successful! You can now log in.");
        onSuccess();
      })
      .catch((err) => {
        Alert.alert("Error", err || "Registration failed. Please try again.");
      });
  };

  return (
    <>
      <TextInput
        style={styles.input}
        placeholder="First Name"
        value={form.firstName}
        onChangeText={(text) => setForm((prev) => ({ ...prev, firstName: text }))}
      />
      <TextInput
        style={styles.input}
        placeholder="Last Name"
        value={form.lastName}
        onChangeText={(text) => setForm((prev) => ({ ...prev, lastName: text }))}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={form.email}
        onChangeText={(text) => setForm((prev) => ({ ...prev, email: text }))}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={form.password}
        onChangeText={(text) => setForm((prev) => ({ ...prev, password: text }))}
        secureTextEntry
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={form.confirmPassword}
        onChangeText={(text) => setForm((prev) => ({ ...prev, confirmPassword: text }))}
        secureTextEntry
        autoCapitalize="none"
      />
      {isBusiness && (
        <GooglePlacesAutocomplete
          placeholder="Search your business name"
          fetchDetails={true}
          onPress={(data, details = null) => {
            if (details) {
              setForm((prev) => ({
                ...prev,
                businessName: details.name,
                location: details.formatted_address,
                placeId: details.place_id,
                lat: details.geometry.location.lat,
                lng: details.geometry.location.lng,
              }));
            }
          }}
          query={{
            key: GOOGLE_API_KEY,
            language: "en",
            types: "establishment",
          }}
          styles={{
            textInputContainer: {
              width: "100%",
              marginBottom: 15,
            },
            textInput: {
              backgroundColor: "#f5f5f5",
              height: 50,
              borderRadius: 5,
              paddingHorizontal: 10,
              borderWidth: 1,
              borderColor: "#ccc",
              fontSize: 16,
            },
            listView: {
              backgroundColor: "#fff",
              borderRadius: 5,
              elevation: 2,
            },
          }}
          {...googlePlacesDefaultProps}
        />
      )}
      <TouchableOpacity style={styles.authButton} onPress={handleRegister}>
        <Text style={styles.authButtonText}>Register</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    width: "100%",
    height: 45,
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  authButton: {
    backgroundColor: "#009999",
    width: "100%",
    paddingVertical: 15,
    borderRadius: 5,
    alignItems: "center",
    marginBottom: 15,
  },
  authButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  }
});
