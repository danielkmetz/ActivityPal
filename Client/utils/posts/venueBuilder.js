import { extractFormattedAddress } from "./extractFormattedAddress";

function cleanStr(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

export function geoFromBusiness(b) {
  const loc = b?.geometry?.location;
  if (!loc) return undefined;

  const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return undefined;

  return {
    type: "Point",
    coordinates: [lng, lat],
    formattedAddress: extractFormattedAddress(b),
  };
}

export function normalizeVenue(v) {
  if (!v) return null;

  const address = v.address ?? extractFormattedAddress(v) ?? extractFormattedAddress(v.geo) ?? null;

  let geo = v.geo || undefined;
  if (geo && address && !geo.formattedAddress) {
    geo = { ...geo, formattedAddress: address };
  }

  return {
    ...v,
    address,
    geo,
  };
}

export function venueFromBusiness(business) {
  const placeId = business?.place_id || business?.placeId || null;
  const label = cleanStr(business?.name || business?.businessName || "");
  if (!placeId || !label) return null;

  const geo = geoFromBusiness(business);
  const address = extractFormattedAddress(business) || geo?.formattedAddress || null;

  return normalizeVenue({
    kind: "place",
    label,
    placeId,
    address,
    geo,
  });
}

export function venueFromCustom(customVenue) {
  const label = cleanStr(customVenue?.label || "");
  if (!label) return null;

  const address = cleanStr(customVenue?.address || "");

  return normalizeVenue({
    kind: "custom",
    label,
    placeId: null,
    address: address || null,
    geo: undefined, // add later if you want
  });
}

/**
 * Legacy invite → VenueSchema-like object
 * Handles: placeId + businessName + location.formattedAddress
 */
export function venueFromLegacyInvite(invite) {
  if (!invite) return null;

  const placeId = invite?.placeId || invite?.business?.placeId || null;

  const label =
    cleanStr(invite?.businessName) ||
    cleanStr(invite?.business?.businessName) ||
    cleanStr(invite?.venue?.label) ||
    null;

  if (!placeId || !label) return null;

  const address =
    extractFormattedAddress(invite) ||
    extractFormattedAddress(invite?.location) ||
    extractFormattedAddress(invite?.business) ||
    null;

  const geo = invite?.location || undefined;
  const patchedGeo =
    geo && address && !geo.formattedAddress ? { ...geo, formattedAddress: address } : geo;

  return normalizeVenue({
    kind: "place",
    label,
    placeId,
    address,
    geo: patchedGeo,
  });
}

export function deriveVenue(selectedVenue, initialInvite) {
  if (selectedVenue) return normalizeVenue(selectedVenue);

  const v = initialInvite?.venue;
  if (v?.kind && v?.label) return normalizeVenue(v);

  return venueFromLegacyInvite(initialInvite);
}
