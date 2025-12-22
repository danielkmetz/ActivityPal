const express = require("express");
const axios = require("axios");
const { getCache, setCache } = require("../utils/simpleCache");

const router = express.Router();

const WEATHER_KEY = process.env.WEATHER_API_KEY; // server-only
const isNum = (v) => Number.isFinite(Number(v));

router.get("/current", async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!isNum(lat) || !isNum(lng)) {
      return res.status(400).json({ error: "Invalid lat/lng" });
    }
    if (!WEATHER_KEY) {
      return res.status(500).json({ error: "Server misconfigured (WEATHER_API_KEY missing)" });
    }

    // Cache by rounded coords so you don't DDoS your provider
    const rLat = Number(lat).toFixed(2);
    const rLng = Number(lng).toFixed(2);
    const cacheKey = `wx:${rLat},${rLng}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const url = "https://api.weatherapi.com/v1/current.json";
    const resp = await axios.get(url, {
      params: {
        key: WEATHER_KEY,
        q: `${lat},${lng}`,
        aqi: "no",
      },
      timeout: 12000,
    });

    const cur = resp.data?.current;
    if (!cur) return res.status(502).json({ error: "Weather provider response missing current" });

    // Normalize response shape (don't leak provider bloat to the client)
    const out = {
      temp_f: cur.temp_f,
      temp_c: cur.temp_c,
      feelslike_f: cur.feelslike_f,
      feelslike_c: cur.feelslike_c,
      humidity: cur.humidity,
      wind_mph: cur.wind_mph,
      is_day: cur.is_day,
      condition: cur.condition?.text || "",
      icon: cur.condition?.icon || "",
      last_updated: cur.last_updated,
    };

    setCache(cacheKey, out, 10 * 60 * 1000); // 10 min
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ error: "Weather lookup failed" });
  }
});

module.exports = router;
