const express = require("express");
const axios = require("axios");
const router = express.Router();
const { getThumbnailUrl, getThumbnailUrls } = require("../services/placeThumbnails");

const GOOGLE_KEY = process.env.GOOGLE_KEY;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

function normalizeBase(baseUrl) {
  const b = String(baseUrl || "").trim();
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

// ✅ Batch thumbnails (one request returns { [placeId]: url|null })
router.post("/thumbnails", async (req, res) => {
  try {
    const placeIdsRaw = req.body?.placeIds;
    if (!Array.isArray(placeIdsRaw)) {
      return res.status(400).json({ error: "placeIds must be an array" });
    }
    if (!GOOGLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured (GOOGLE_KEY missing)" });
    }

    const placeIds = placeIdsRaw
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);

    const MAX = 12;
    const unique = Array.from(new Set(placeIds)).slice(0, MAX);
    if (unique.length === 0) return res.json({ results: {} });

    const base = normalizeBase(PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`);

    const results = await getThumbnailUrls(unique, base, { limit: MAX, concurrency: 5 });
    return res.json({ results });
  } catch (err) {
    return res.status(500).json({ error: "Failed to batch thumbnails" });
  }
});

// ✅ Single thumbnail (kept for backwards compatibility)
router.get("/thumbnail", async (req, res) => {
  try {
    const { placeId } = req.query;
    if (!placeId) return res.status(400).json({ error: "Missing placeId" });
    if (!GOOGLE_KEY) return res.status(500).json({ error: "Server misconfigured (GOOGLE_KEY missing)" });

    const base = normalizeBase(PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`);
    const url = await getThumbnailUrl(placeId, base);

    return res.json({ url: url ?? null });
  } catch (err) {
    return res.status(500).json({ error: "Failed to get thumbnail" });
  }
});

// ✅ Proxy the actual photo bytes (unchanged, but slightly hardened)
router.get("/photo", async (req, res) => {
  try {
    const { photoRef, maxwidth = 300 } = req.query;
    if (!photoRef) return res.status(400).send("Missing photoRef");
    if (!GOOGLE_KEY) return res.status(500).send("Server misconfigured");

    const photoUrl = "https://maps.googleapis.com/maps/api/place/photo";
    const r = await axios.get(photoUrl, {
      params: { maxwidth, photoreference: photoRef, key: GOOGLE_KEY },
      responseType: "arraybuffer",
      timeout: 12000,
      validateStatus: () => true,
    });

    if (r.status >= 400) return res.status(502).send("Photo fetch failed");

    res.set("Content-Type", r.headers["content-type"] || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400"); // 7d + SWR

    return res.send(Buffer.from(r.data));
  } catch (err) {
    return res.status(500).send("Photo proxy failed");
  }
});

module.exports = router;
