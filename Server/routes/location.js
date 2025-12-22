const express = require("express");
const axios = require("axios");
const { getCache, setCache } = require("../utils/simpleCache");

const router = express.Router();
const GOOGLE_KEY = process.env.GOOGLE_KEY;

const isNum = (v) => Number.isFinite(Number(v));
const inRange = (lat, lng) => Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180;

router.get("/geocode", async (req, res) => {
  try {
    const address = (req.query.address || "").trim();
    if (!address) return res.status(400).json({ error: "Missing address" });
    if (address.length > 200) return res.status(400).json({ error: "Address too long" });
    if (!GOOGLE_KEY) return res.status(500).json({ error: "Server misconfigured (GOOGLE key missing)" });

    const cacheKey = `geocode:${address.toLowerCase()}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const url = "https://maps.googleapis.com/maps/api/geocode/json";
    const resp = await axios.get(url, { params: { address, key: GOOGLE_KEY }, timeout: 12000 });

    const data = resp.data;
    if (data.status !== "OK" || !data.results?.length) {
      return res.status(404).json({ error: data.error_message || "Address not found" });
    }

    const loc = data.results[0].geometry.location; // { lat, lng }
    const out = { lat: loc.lat, lng: loc.lng };

    setCache(cacheKey, out, 24 * 60 * 60 * 1000); // 24h
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ error: "Geocode failed" });
  }
});

router.get("/reverse-geocode", async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!isNum(lat) || !isNum(lng)) return res.status(400).json({ error: "Invalid lat/lng" });
    if (!inRange(lat, lng)) return res.status(400).json({ error: "lat/lng out of range" });
    if (!GOOGLE_KEY) return res.status(500).json({ error: "Server misconfigured (GOOGLE key missing)" });

    // Round coords for cache stability
    const rLat = Number(lat).toFixed(4);
    const rLng = Number(lng).toFixed(4);
    const cacheKey = `revgeo:${rLat},${rLng}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const url = "https://maps.googleapis.com/maps/api/geocode/json";
    const resp = await axios.get(url, {
      params: { latlng: `${lat},${lng}`, key: GOOGLE_KEY },
      timeout: 12000,
    });

    const data = resp.data;
    if (data.status !== "OK" || !data.results?.length) {
      return res.status(404).json({ error: data.error_message || "Address not found" });
    }

    const top = data.results[0];
    const comps = top.address_components || [];

    const pick = (type) => comps.find((c) => (c.types || []).includes(type))?.long_name || "";

    const out = {
      formattedAddress: top.formatted_address || "",
      city: pick("locality"),
      state: pick("administrative_area_level_1"),
      country: pick("country"),
    };

    setCache(cacheKey, out, 24 * 60 * 60 * 1000); // 24h
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ error: "Reverse geocode failed" });
  }
});

router.get("/timezone", async (req, res) => {
  try {
    const { lat, lng, timestamp } = req.query;
    if (!isNum(lat) || !isNum(lng)) return res.status(400).json({ error: "Invalid lat/lng" });
    if (!inRange(lat, lng)) return res.status(400).json({ error: "lat/lng out of range" });
    if (!GOOGLE_KEY) return res.status(500).json({ error: "Server misconfigured (GOOGLE key missing)" });

    const ts = isNum(timestamp) ? Math.floor(Number(timestamp)) : Math.floor(Date.now() / 1000);

    const rLat = Number(lat).toFixed(3);
    const rLng = Number(lng).toFixed(3);
    const cacheKey = `tz:${rLat},${rLng}:${ts}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const url = "https://maps.googleapis.com/maps/api/timezone/json";
    const resp = await axios.get(url, {
      params: { location: `${lat},${lng}`, timestamp: ts, key: GOOGLE_KEY },
      timeout: 12000,
    });

    const data = resp.data;
    if (data.status !== "OK") {
      return res.status(400).json({ error: data.errorMessage || "Timezone lookup failed" });
    }

    const out = {
      timeZoneId: data.timeZoneId,
      timeZoneName: data.timeZoneName,
      rawOffset: data.rawOffset,
      dstOffset: data.dstOffset,
    };

    setCache(cacheKey, out, 6 * 60 * 60 * 1000); // 6h
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ error: "Timezone lookup failed" });
  }
});

module.exports = router;
