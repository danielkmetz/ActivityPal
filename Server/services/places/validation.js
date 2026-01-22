function parseCursor(raw) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parsePerPage(raw, { MIN_PER_PAGE, MAX_PER_PAGE }) {
  const n = Number(raw || 15);
  return Math.min(MAX_PER_PAGE, Math.max(MIN_PER_PAGE, n));
}

function validateNewSearchBody(body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const radiusMeters = Number(body.radius);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, status: 400, error: "Invalid lat/lng" };
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000) {
    return { ok: false, status: 400, error: "Invalid radius (meters). Must be 0 < radius <= 50000" };
  }

  return {
    ok: true,
    value: {
      lat,
      lng,
      radiusMeters,
      activityType: body.activityType || null,
      budget: body.budget || null,
      isCustom: !!body.isCustom,
      diningMode: body.diningMode,
    },
  };
}

module.exports = {
  parseCursor,
  parsePerPage,
  validateNewSearchBody,
};
