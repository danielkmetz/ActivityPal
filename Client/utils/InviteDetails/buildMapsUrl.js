import { Platform } from "react-native";

export function buildMapsUrl({ address, placeId, label }) {
  const q = encodeURIComponent(address || label || "");
  const pid = encodeURIComponent(placeId || "");

  if (Platform.OS === "ios") {
    // Apple Maps: query is the most reliable without lat/lng
    return `http://maps.apple.com/?q=${q}`;
  }

  // Android: prefer Google Maps with placeId when available
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${pid}`;
  }

  // geo intent works with many map apps
  return `geo:0,0?q=${q}`;
}
