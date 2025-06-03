import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Dimensions,
} from "react-native";
import { useSelector } from "react-redux";
import {
   selectError,
} from "../../Slices/UserSlice";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [isBusiness, setIsBusiness] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    businessName: "",
    location: "",
    placeId: "",
    lat: null,
    lng: null,
  });

  const error = useSelector(selectError);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{}} keyboardShouldPersistTaps="handled">
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
          {mode === "login" ? (
            <LoginForm
              form={form}
              setForm={setForm}
              isBusiness={isBusiness}
            />
          ) : (
            <RegisterForm
              form={form}
              setForm={setForm}
              isBusiness={isBusiness}
              onSuccess={() => setMode("login")}
            />
          )}

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
    marginTop: SCREEN_HEIGHT * .15
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
    backgroundColor: "#33cccc",
  },
  toggleText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "bold",
  },
  switchText: {
    color: "#009999",
    fontSize: 14,
    marginTop: 10,
  },
  errorText: {
    color: "red",
    marginTop: 10,
    fontSize: 14,
  },
});
