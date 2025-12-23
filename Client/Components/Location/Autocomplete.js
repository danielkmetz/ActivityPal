import React, { forwardRef, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { googlePlacesDefaultProps } from "../../utils/googleplacesDefaults";
import { getUserToken } from "../../functions";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

const Autocomplete = forwardRef(({ onPlaceSelected, types }, ref) => {
  const [token, setToken] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const t = await getUserToken(); // must return string token or null
        if (mounted) setToken(t || null);
      } catch (e) {
        if (mounted) setToken(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={{ zIndex: 999, position: "relative", elevation: 10 }}>
      <GooglePlacesAutocomplete
        {...googlePlacesDefaultProps}
        ref={ref}
        placeholder="Search for a business"
        fetchDetails
        debounce={500}
        minLength={3}
        timeout={8000}
        textInputProps={{ editable: !!token }}
        query={{
          key: "unused",
          language: "en",
          types,
        }}
        requestUrl={{
          url: `${BASE_URL}/autocomplete/google-ap`,
          useOnPlatform: "all",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }}
        onPress={(data, details) => onPlaceSelected(details)}
        styles={{
          textInput: styles.input,
          listView: styles.listView,
        }}
      />
    </View>
  );
});

export default Autocomplete;

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#f5f5f5",
    height: 50,
    borderRadius: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    fontSize: 16,
  },
  listView: {
    backgroundColor: "white",
    position: "relative",
    marginBottom: 30,
    width: "100%",
    zIndex: 9999,
    elevation: 10,
    maxHeight: 200,
  },
});
