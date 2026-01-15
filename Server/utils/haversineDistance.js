const EARTH_RADIUS_M = 6371000; // Earth's radius in meters

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Calculates the great-circle distance in meters between two lat/lng points.
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number|null} - Distance in meters or null if invalid
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== 'number' || typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' || typeof lon2 !== 'number' ||
    isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)
  ) {
    return null;
  }

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const distance = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return distance;
}

module.exports = { haversineDistance };
