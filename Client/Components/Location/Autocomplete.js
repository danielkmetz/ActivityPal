import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { googlePlacesDefaultProps } from '../../utils/googleplacesDefaults';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_KEY;

const Autocomplete = forwardRef(({ onPlaceSelected, types }, ref) => {
  return (
    <View style={{ zIndex: 999, position: 'relative', elevation: 10, }}>
      <GooglePlacesAutocomplete
        ref={ref}
        placeholder="Search for a business"
        fetchDetails
        onPress={(data, details) => onPlaceSelected(details)}
        query={{
          key: GOOGLE_API_KEY,
          language: "en",
          types: types,
        }}
        styles={{
          textInput: styles.input,
          listView: styles.listView,
        }}
        {...googlePlacesDefaultProps}
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
    backgroundColor: 'white',
    position: 'absolute',
    top: 55,
    width: '100%',
    zIndex: 9999,
    elevation: 10,
    maxHeight: 200,
  },
});
