function normalizePoint(input) {
  if (!input) return null;

  // Accept full GeoJSON (only if valid)
  if (typeof input === 'object' && input.type === 'Point' && Array.isArray(input.coordinates)) {
    const [lng, lat] = input.coordinates.map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return { type: 'Point', coordinates: [lng, lat] };
    }
    return null;
  }

  // Accept { lat, lng } / { latitude, longitude } / { lat, lon }
  if (typeof input === 'object') {
    const lat = Number(input.lat ?? input.latitude);
    const lng = Number(input.lng ?? input.lon ?? input.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { type: 'Point', coordinates: [lng, lat] };
    }

    // Accept { coordinates: [lng, lat] }
    if (Array.isArray(input.coordinates) && input.coordinates.length === 2) {
      const [lng2, lat2] = input.coordinates.map(Number);
      if (Number.isFinite(lng2) && Number.isFinite(lat2)) {
        return { type: 'Point', coordinates: [lng2, lat2] };
      }
    }

    return null;
  }

  // Accept "lat,lng" string
  if (typeof input === 'string') {
    const parts = input.split(',').map(s => Number(s.trim()));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      const [lat, lng] = parts;
      return { type: 'Point', coordinates: [lng, lat] };
    }
    return null;
  }

  return null;
}

module.exports = { normalizePoint };
