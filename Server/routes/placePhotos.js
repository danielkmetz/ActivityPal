const express = require("express");
const axios = require("axios");
const router = express.Router();

const GOOGLE_KEY = process.env.GOOGLE_KEY;

router.get("/thumbnail", async (req, res) => {
  try {
    const { placeId } = req.query;
    if (!placeId) return res.status(400).json({ error: "Missing placeId" });
    if (!GOOGLE_KEY) return res.status(500).json({ error: "Server misconfigured (GOOGLE_MAPS_API_KEY missing)" });

    const detailsUrl = "https://maps.googleapis.com/maps/api/place/details/json";
    const details = await axios.get(detailsUrl, {
      params: { place_id: placeId, fields: "photos", key: GOOGLE_KEY },
      timeout: 12000,
    });

    const photoRef = details.data?.result?.photos?.[0]?.photo_reference;
    if (!photoRef) return res.json({ url: null });

    // IMPORTANT: you can either:
    // A) Return the Google photo URL (still uses your server key! not good)
    // B) Proxy the image bytes through YOUR server (better)
    //
    // We'll do B: give back a proxied URL that your server can serve.
    const proxiedUrl = `/api/places/photo?photoRef=${encodeURIComponent(photoRef)}&maxwidth=300`;
    return res.json({ url: proxiedUrl });
  } catch (err) {
    return res.status(500).json({ error: "Failed to get thumbnail" });
  }
});

// Optional: proxy the actual photo bytes
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
    res.set("Cache-Control", "public, max-age=86400"); // cache 1 day
    return res.send(Buffer.from(r.data));
  } catch (err) {
    return res.status(500).send("Photo proxy failed");
  }
});

module.exports = router;
