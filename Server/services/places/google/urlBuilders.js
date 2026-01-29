function buildNearbyBaseUrl({
  lat,
  lng,
  radiusMeters,
  type,
  keyword,
  rankbyDistance,
  openNowOnly, // NEW
  apiKey,
}) {
  const base = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

  const params = new URLSearchParams();

  params.set("location", `${lat},${lng}`);
  params.set("key", apiKey);

  const t = typeof type === "string" && type.trim() ? type.trim() : null;
  const k = typeof keyword === "string" && keyword.trim() ? keyword.trim() : null;

  if (t) params.set("type", t);
  if (k) params.set("keyword", k);

  if (openNowOnly) params.set("opennow", "true");

  if (rankbyDistance) {
    // IMPORTANT: When rankby=distance is used, radius must NOT be present.
    params.set("rankby", "distance");
  } else {
    params.set("radius", String(radiusMeters));
  }

  return `${base}?${params.toString()}`;
}

function buildNearbyUrl(baseUrl, pageToken) {
  const token = typeof pageToken === "string" && pageToken.trim() ? pageToken.trim() : null;
  if (!token) return baseUrl;
  return `${baseUrl}&pagetoken=${encodeURIComponent(token)}`;
}

module.exports = { buildNearbyBaseUrl, buildNearbyUrl };
