import React, { useMemo } from "react";
import { View, TextInput, StyleSheet } from "react-native";
import SectionHeader from "../SectionHeader";
import PlacesAutocomplete from "../../Location/PlacesAutocomplete";

export default function CustomVenueFields({
  customVenue,
  setCustomVenue,
  placesKey,
  lat = null,
  lng = null,
}) {
  const addressPrefill = useMemo(
    () => (customVenue?.address || "").trim(),
    [customVenue?.address]
  );

  return (
    <View style={{ marginTop: 10 }}>
      <SectionHeader title="Custom Location" />
      {/* Name / label stays manual */}
      <TextInput
        style={styles.input}
        placeholder="Name (e.g., Dan’s place, Dave’s house)"
        value={customVenue?.label || ""}
        onChangeText={(t) => setCustomVenue((p) => ({ ...p, label: t }))}
      />
      {/* Address is now autocomplete in address mode */}
      <PlacesAutocomplete
        key={placesKey}
        mode="address"
        lat={lat}
        lng={lng}
        prefillLabel={addressPrefill}
        placeholder="Search an address"
        onClear={() => setCustomVenue((p) => ({ ...p, address: "" }))}
        onPlaceSelected={(details) => {
          const addr = (details?.formatted_address || "").trim();
          setCustomVenue((p) => ({
            ...p,
            address: addr,
          }));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#f5f5f5",
    height: 50,
    borderRadius: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    fontSize: 16,
    marginBottom: 10,
  },
});
