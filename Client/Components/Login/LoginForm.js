import React from "react";
import { TextInput, TouchableOpacity, Text, Alert, StyleSheet } from "react-native";
import { useDispatch } from "react-redux";
import { loginUser } from "../../Slices/UserSlice";

export default function LoginForm({ form, setForm, isBusiness }) {
  const dispatch = useDispatch();

  const handleLogin = () => {
    const { email, password } = form;

    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    dispatch(loginUser({ email, password, isBusiness }))
      .unwrap()
      .then(() => {
        Alert.alert("Success", "Login successful!");
      })
      .catch((err) => {
        Alert.alert("Error", err || "Login failed. Please try again.");
      });
  };

  return (
    <>
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
      <TouchableOpacity style={styles.authButton} onPress={handleLogin}>
        <Text style={styles.authButtonText}>Login</Text>
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
