function buildNearbyBaseUrl({ lat, lng, radiusMeters, type, keyword, rankbyDistance, apiKey }) {
  const keywordParam = keyword ? `&keyword=${encodeURIComponent(keyword)}` : "";
  const typeParam = type ? `&type=${encodeURIComponent(type)}` : "";

  if (rankbyDistance) {
    return `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lng}&rankby=distance${typeParam}&key=${apiKey}${keywordParam}`;
  }

  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${lat},${lng}&radius=${radiusMeters}${typeParam}&key=${apiKey}${keywordParam}`;
}

function buildNearbyUrl(baseUrl, pageToken) {
  if (!pageToken) return baseUrl;
  return `${baseUrl}&pagetoken=${encodeURIComponent(pageToken)}`;
}

module.exports = { buildNearbyBaseUrl, buildNearbyUrl };
