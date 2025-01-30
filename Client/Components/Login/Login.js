import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { useDispatch, useSelector } from "react-redux";
import {
  loginUser,
  registerUser,
  selectLoading,
  selectError,
} from "../../Slices/UserSlice";

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY; // Replace with your actual API key

export default function LoginPage() {
  const [isBusiness, setIsBusiness] = useState(false);
  const [placeId, setPlaceId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState(""); // New field for business location
  const [mode, setMode] = useState("login");
  
  const dispatch = useDispatch();
  const error = useSelector(selectError);
  const loading = useSelector(selectLoading);

  const handleAuth = () => {
    if (mode === "login") {
      if (!email || !password) {
        Alert.alert("Error", "Please fill in all fields.");
        return;
      }

      dispatch(
        loginUser({
          email,
          password,
          isBusiness,
        })
      )
        .unwrap()
        .then(() => {
          Alert.alert("Success", "Login successful!");
        })
        .catch((err) => {
          Alert.alert("Error", err || "Login failed. Please try again.");
        });
    } else {
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
          placeId,
          businessName,
          location, // Include the business location
        })
      )
        .unwrap()
        .then(() => {
          Alert.alert("Success", "Registration successful! You can now log in.");
          setMode("login");
        })
        .catch((err) => {
          Alert.alert("Error", err || "Registration failed. Please try again.");
        });
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Text style={styles.title}>
            {mode === "login" ? "Login" : "Register"}
          </Text>

          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, !isBusiness && styles.activeToggle]}
              onPress={() => setIsBusiness(false)}
            >
              <Text style={styles.toggleText}>General User</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, isBusiness && styles.activeToggle]}
              onPress={() => setIsBusiness(true)}
            >
              <Text style={styles.toggleText}>Business</Text>
            </TouchableOpacity>
          </View>

          {mode === "register" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="First Name"
                value={firstName}
                onChangeText={setFirstName}
              />
              <TextInput
                style={styles.input}
                placeholder="Last Name"
                value={lastName}
                onChangeText={setLastName}
              />
            </>
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          {mode === "register" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />
              {isBusiness && (
                <>
                  <GooglePlacesAutocomplete
                    placeholder="Search your business name"
                    fetchDetails={true} // Ensures detailed information is retrieved
                    onPress={(data, details = null) => {
                      if (details) {
                        setBusinessName(details.name); // Populate the business name
                        setLocation(details.formatted_address); // Populate the location
                        setPlaceId(details.place_id);
                        //console.log(details);
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
                  />
                </>
              )}
            </>
          )}

          <TouchableOpacity
            style={styles.authButton}
            onPress={handleAuth}
          >
              <Text style={styles.authButtonText}>
                {mode === "login" ? "Login" : "Register"}
              </Text>
            
          </TouchableOpacity>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            onPress={() => setMode(mode === "login" ? "register" : "login")}
          >
            <Text style={styles.switchText}>
              {mode === "login"
                ? "Don't have an account? Register here."
                : "Already have an account? Log in here."}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f5f5f5",
    marginTop: 120,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  toggleContainer: {
    flexDirection: "row",
    marginBottom: 20,
    borderRadius: 5,
    overflow: "hidden",
  },
  toggleButton: {
    padding: 10,
    backgroundColor: "#ddd",
    flex: 1,
    alignItems: "center",
  },
  activeToggle: {
    backgroundColor: "#4caf50",
  },
  toggleText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "bold",
  },
  input: {
    width: "100%",
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  authButton: {
    backgroundColor: "#4caf50",
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
  },
  switchText: {
    color: "#4caf50",
    fontSize: 14,
    marginTop: 10,
  },
  errorText: {
    color: "red",
    marginTop: 10,
    fontSize: 14,
  },
});
