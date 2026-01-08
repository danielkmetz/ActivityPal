const express = require("express");
const axios = require("axios");
const router = express.Router();
const { getThumbnailUrls } = require("../services/placeThumbnails");

const GOOGLE_KEY = process.env.GOOGLE_KEY;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

router.get("/autocomplete", async (req, res) => {
  try {
    const { input, lat, lng, mode = "establishment", sessionToken, country = "us" } = req.query;
    if (!input) return res.status(400).json({ error: "Missing input" });
    if (!GOOGLE_KEY) return res.status(500).json({ error: "Server misconfigured (GOOGLE_KEY missing)" });

    const url = "https://maps.googleapis.com/maps/api/place/autocomplete/json";

    // establishment vs address
    const modeNorm = String(mode || "establishment").trim().toLowerCase();
const isAddress = modeNorm === "address";
const types = isAddress ? "address" : "establishment";

    const params = {
      input,
      key: GOOGLE_KEY,
      language: "en",
      types,
      ...(sessionToken ? { sessiontoken: String(sessionToken) } : {}),
      ...(country ? { components: `country:${country}` } : {}),
    };

    if (lat && lng) {
      params.location = `${lat},${lng}`;
      params.radius = 50000;
    }

    const r = await axios.get(url, { params, timeout: 12000, validateStatus: () => true });

    if (r.status >= 400) return res.status(502).json({ error: "Autocomplete failed" });

    if (r.data?.status !== "OK" && r.data?.status !== "ZERO_RESULTS") {
      return res.status(502).json({
        error: r.data?.error_message || "Autocomplete failed",
        status: r.data?.status,
      });
    }

    const predictions = Array.isArray(r.data?.predictions) ? r.data.predictions : [];

    // Addresses: don’t do thumbnails (pointless + slows typing)
    if (isAddress) {
      return res.json({ predictions, thumbnails: {} });
    }

    // your existing thumbnails behavior for establishments
    const base = PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const topIds = predictions.slice(0, 5).map((p) => p?.place_id).filter(Boolean);

    const DEADLINE_MS = 700;
    const thumbnails =
      topIds.length === 0
        ? {}
        : await Promise.race([
            getThumbnailUrls(topIds, base, { limit: 5, concurrency: 4 }),
            new Promise((resolve) => setTimeout(() => resolve({}), DEADLINE_MS)),
          ]);

    return res.json({ predictions, thumbnails });
  } catch (err) {
    return res.status(500).json({ error: "Autocomplete failed" });
  }
});

router.get("/details", async (req, res) => {
  try {
    const { placeId, mode = "establishment", sessionToken } = req.query;
    if (!placeId) return res.status(400).json({ error: "Missing placeId" });
    if (!GOOGLE_KEY) return res.status(500).json({ error: "Server misconfigured (GOOGLE_KEY missing)" });

    const url = "https://maps.googleapis.com/maps/api/place/details/json";

    const fields =
      mode === "address"
        ? ["formatted_address", "geometry", "place_id", "address_components"].join(",")
        : ["name", "formatted_address", "formatted_phone_number", "editorial_summary", "reviews", "geometry", "place_id"].join(",");

    const r = await axios.get(url, {
      params: {
        place_id: placeId,
        fields,
        key: GOOGLE_KEY,
        ...(sessionToken ? { sessiontoken: String(sessionToken) } : {}),
      },
      timeout: 12000,
      validateStatus: () => true,
    });

    if (r.status >= 400) return res.status(502).json({ error: "Details failed" });

    if (r.data?.status !== "OK") {
      return res.status(502).json({
        error: r.data?.error_message || "Details failed",
        status: r.data?.status,
      });
    }

    return res.json({ result: r.data?.result || null });
  } catch (err) {
    return res.status(500).json({ error: "Details failed" });
  }
});

module.exports = router;
