const { haversineDistance } = require("../../../utils/haversineDistance");

const countryClubNamePattern = /Country Club|Golf Course|Golf Club|Links/i;

function toCuratedPlace({ place, originLat, originLng, radiusMeters }) {
  const loc = place?.location;
  if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return null;

  const distanceMeters = haversineDistance(originLat, originLng, loc.latitude, loc.longitude);
  if (!Number.isFinite(distanceMeters)) return null;
  if (distanceMeters > radiusMeters) return null;

  const name = place?.displayName?.text || "";
  if (countryClubNamePattern.test(name)) return null;

  const photoName = place?.photos?.[0]?.name || null;

  return {
    name: name || null,
    types: Array.isArray(place?.types) ? place.types : [],
    address: place?.shortFormattedAddress || null,
    place_id: place?.id || null,
    photoName,
    photoUrl: null,
    distance: +(distanceMeters / 1609.34).toFixed(2),
    location: { lat: loc.latitude, lng: loc.longitude },

    petFriendly: typeof place?.allowsDogs === "boolean" ? place.allowsDogs : null,
    openingHours: place?.regularOpeningHours || null,
    openNow: typeof place?.currentOpeningHours?.openNow === "boolean" ? place.currentOpeningHours.openNow : null,
    goodForChildren: typeof place?.goodForChildren === "boolean" ? place.goodForChildren : null,

    promotions: [],
    events: [],
    _peHydrated: false,
  };
}

module.exports = { toCuratedPlace };
