export const googlePlacesDefaultProps = {
    autoFillOnNotFound: false,
    currentLocation: false,
    currentLocationLabel: "Current location",
    debounce: 0,
    disableScroll: false,
    enableHighAccuracyLocation: true,
    enablePoweredByContainer: true,
    filterReverseGeocodingByTypes: [],
    GooglePlacesDetailsQuery: {},
    GooglePlacesSearchQuery: {
      rankby: "distance",
      type: "restaurant",
    },
    GoogleReverseGeocodingQuery: {},
    isRowScrollable: true,
    keyboardShouldPersistTaps: "always",
    listUnderlayColor: "#c8c7cc",
    listViewDisplayed: "auto",
    keepResultsAfterBlur: false,
    minLength: 1,
    nearbyPlacesAPI: "GooglePlacesSearch",
    numberOfLines: 1,
    onNotFound: () => {},
    onTimeout: () =>
      console.warn("google places autocomplete: request timeout"),
    predefinedPlaces: [],
    predefinedPlacesAlwaysVisible: false,
    suppressDefaultStyles: false,
    textInputHide: false,
    textInputProps: {},
    timeout: 20000,
  };
  