const express = require("express");
const axios = require("axios");
const router = express.Router();
const GOOGLE_KEY = process.env.GOOGLE_KEY;
const GOOGLE_BASE = "https://maps.googleapis.com/maps/api";
const TIMEOUT_MS = 8000;

// Simple in-memory cache (fine for dev/beta)
const cache = new Map(); // key -> { exp, data }
const inflight = new Map(); // key -> Promise

function stableStringify(obj) {
  const keys = Object.keys(obj || {}).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data, ttlMs) {
  cache.set(key, { exp: Date.now() + ttlMs, data });
  // crude cap
  if (cache.size > 2000) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function ttlFor(kind) {
  if (kind === "autocomplete") return 60_000; // 60s
  if (kind === "details") return 10 * 60_000; // 10m
  return 60_000;
}

function makeKey(kind, params) {
  return `${kind}|${stableStringify(params)}`;
}

// GET /api/places/autocomplete?input=...&types=establishment&location=..&radius=..&sessiontoken=..
router.get("/autocomplete", async (req, res) => {
  try {
    if (!GOOGLE_KEY) return res.status(500).json({ error: "Missing GOOGLE_KEY" });

    const input = String(req.query?.input || "").trim();
    if (input.length < 3) return res.status(200).json({ predictions: [] });
    if (input.length > 200) return res.status(400).json({ error: "Input too long" });

    const params = {
      input,
      language: String(req.query?.language || "en"),
    };

    // These are optional but useful
    if (req.query?.types) params.types = String(req.query.types);
    if (req.query?.location) params.location = String(req.query.location); // "lat,lng"
    if (req.query?.radius) params.radius = String(req.query.radius);
    if (req.query?.components) params.components = String(req.query.components);

    // Strongly recommended by Google for autocomplete sessions
    if (req.query?.sessiontoken) params.sessiontoken = String(req.query.sessiontoken);

    const cacheKey = makeKey("autocomplete", params);
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    if (inflight.has(cacheKey)) {
      const data = await inflight.get(cacheKey);
      return res.status(200).json(data);
    }

    const url = `${GOOGLE_BASE}/place/autocomplete/json`;

    const p = (async () => {
      const r = await axios.get(url, { params: { ...params, key: GOOGLE_KEY }, timeout: TIMEOUT_MS });
      return r.data;
    })();

    inflight.set(cacheKey, p);

    let body;
    try {
      body = await p;
    } finally {
      inflight.delete(cacheKey);
    }

    // Google can return 200 with error payload
    if (body?.status && body.status !== "OK" && body.status !== "ZERO_RESULTS") {
      return res.status(502).json(body);
    }

    cacheSet(cacheKey, body, ttlFor("autocomplete"));
    return res.status(200).json(body);
  } catch (e) {
    const status = e.response?.status || 500;
    return res.status(status).json({
      error: "Places autocomplete failed",
      status,
      details: e.response?.data || String(e.message),
    });
  }
});

// GET /api/places/details?placeId=...&sessiontoken=...
router.get("/details", async (req, res) => {
  try {
    if (!GOOGLE_KEY) return res.status(500).json({ error: "Missing GOOGLE_KEY" });

    const placeId = String(req.query?.placeId || "").trim();
    if (!placeId) return res.status(400).json({ error: "Missing placeId" });

    const fields =
      String(
        req.query?.fields ||
          "place_id,name,formatted_address,geometry,types,website,formatted_phone_number,opening_hours,photos"
      );

    const params = {
      place_id: placeId,
      fields,
      language: String(req.query?.language || "en"),
    };

    if (req.query?.sessiontoken) params.sessiontoken = String(req.query.sessiontoken);

    const cacheKey = makeKey("details", params);
    const cached = cacheGet(cacheKey);
    if (cached) return res.status(200).json(cached);

    if (inflight.has(cacheKey)) {
      const data = await inflight.get(cacheKey);
      return res.status(200).json(data);
    }

    const url = `${GOOGLE_BASE}/place/details/json`;

    const p = (async () => {
      const r = await axios.get(url, { params: { ...params, key: GOOGLE_KEY }, timeout: TIMEOUT_MS });
      return r.data;
    })();

    inflight.set(cacheKey, p);

    let body;
    try {
      body = await p;
    } finally {
      inflight.delete(cacheKey);
    }

    if (body?.status && body.status !== "OK") {
      return res.status(502).json(body);
    }

    cacheSet(cacheKey, body, ttlFor("details"));
    return res.status(200).json(body);
  } catch (e) {
    const status = e.response?.status || 500;
    return res.status(status).json({
      error: "Place details failed",
      status,
      details: e.response?.data || String(e.message),
    });
  }
});

module.exports = router;
