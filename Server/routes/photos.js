const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Business = require("../models/Business");
const { generatePresignedUrl } = require("../helpers/generatePresignedUrl");
const { getPresignedUrl } = require("../utils/cachePresignedUrl.js");
const { s3Client: s3 } = require('../s3Config.js');

const router = express.Router();

// -------------------- tiny utils --------------------
const safeString = (v) => (typeof v === "string" ? v : "");
const cleanName = (name) =>
  safeString(name)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);

const cleanLabel = (label) => safeString(label).trim().slice(0, 80);

const normalizeFiles = (files) =>
  (Array.isArray(files) ? files : [])
    .map((f) => ({
      name: cleanName(f?.name),
      type: safeString(f?.type),
    }))
    .filter((f) => !!f.name);

const isNonEmpty = (s) => typeof s === "string" && s.trim().length > 0;

// -------------------- Business helpers --------------------
const findBusiness = async (placeId) => {
  const business = await Business.findOne({ placeId });
  if (!business) throw new Error("Business not found.");
  return business;
};

// -------------------- Venue / upload context --------------------
function resolveUploadContext(req) {
  // legacy param
  const placeIdParam = safeString(req.params?.placeId).trim() || null;

  // new body fields
  const placeIdBody = safeString(req.body?.placeId).trim() || null;
  const userId = safeString(req.body?.userId).trim() || null;

  const venueRaw = req.body?.venue && typeof req.body.venue === "object" ? req.body.venue : null;
  const venueKind = safeString(venueRaw?.kind).trim(); // "place" | "custom"
  const venueLabel = cleanLabel(venueRaw?.label);
  const venuePlaceId = safeString(venueRaw?.placeId).trim() || null;

  // Priority: explicit placeId in params/body wins for backwards compatibility
  const effectivePlaceId = placeIdParam || placeIdBody || (venueKind === "place" ? venuePlaceId : null);

  if (effectivePlaceId) {
    return {
      kind: "place",
      placeId: effectivePlaceId,
      label: venueLabel || null,
      userId,
    };
  }

  // Custom venue: must have a label (placeId must remain null)
  if (venueKind === "custom" && isNonEmpty(venueLabel)) {
    return {
      kind: "custom",
      placeId: null,
      label: venueLabel,
      userId: userId || "anon",
    };
  }

  return null;
}

function buildPhotoKey(ctx, fileName) {
  // Keep legacy folder structure for place uploads
  if (ctx.kind === "place") {
    return `photos/${ctx.placeId}/${uuidv4()}_${fileName}`;
  }

  // Custom venue uploads MUST NOT be grouped by placeId
  // We group by userId to keep it organized and prevent collisions
  return `photos/custom/${ctx.userId}/${uuidv4()}_${fileName}`;
}

// -------------------- UPLOAD (NEW) --------------------
/**
 * POST /photos/upload
 * Body:
 * {
 *   placeId?: string,
 *   userId?: string, // strongly recommended for custom uploads
 *   venue?: { kind: "place"|"custom", label: string, placeId?: string },
 *   files: [{ name, type }]
 * }
 *
 * Returns { presignedUrls: [{ url, photoKey }, ...] } in SAME ORDER as files.
 */
router.post("/upload", async (req, res) => {
  const files = normalizeFiles(req.body?.files);

  if (!files.length) {
    return res.status(400).json({ message: "No files provided." });
  }

  const ctx = resolveUploadContext(req);
  if (!ctx) {
    return res.status(400).json({
      message: "Upload requires either placeId OR venue.kind='custom' with a label.",
    });
  }

  try {
    const presignedUrls = await Promise.all(
      files.map(async (file) => {
        const photoKey = buildPhotoKey(ctx, file.name);

        // generatePresignedUrl(photoKey) is your current signature.
        // Passing file.type as a 2nd arg is safe even if your helper ignores it.
        const url = await generatePresignedUrl(photoKey, file.type || undefined);

        return { url, photoKey };
      })
    );

    return res.status(200).json({ presignedUrls });
  } catch (error) {
    console.error("Error generating pre-signed URLs:", error?.message || error);
    return res.status(500).json({ message: "Error generating pre-signed URLs." });
  }
});

// -------------------- UPLOAD (LEGACY) --------------------
/**
 * POST /photos/upload/:placeId
 * Backwards compatible with existing clients.
 */
router.post("/upload/:placeId", async (req, res) => {
  // Just route it through the new handler logic by ensuring ctx resolves from params
  const files = normalizeFiles(req.body?.files);

  if (!files.length) {
    return res.status(400).json({ message: "No files provided." });
  }

  const ctx = resolveUploadContext(req);
  if (!ctx || ctx.kind !== "place") {
    return res.status(400).json({ message: "Missing or invalid placeId." });
  }

  try {
    const presignedUrls = await Promise.all(
      files.map(async (file) => {
        const photoKey = buildPhotoKey(ctx, file.name);
        const url = await generatePresignedUrl(photoKey, file.type || undefined);
        return { url, photoKey };
      })
    );

    return res.status(200).json({ presignedUrls });
  } catch (error) {
    console.error("Error generating pre-signed URLs:", error?.message || error);
    return res.status(500).json({ message: "Error generating pre-signed URLs." });
  }
});

// -------------------- METADATA (NEW) --------------------
/**
 * POST /photos/metadata
 * Body supports BOTH:
 *  - legacy: body is an array of photos
 *  - new: { placeId?, venue?, photos: [...] }
 *
 * For custom venues:
 *  - DOES NOT write to Business collection (by design)
 *  - returns { savedToBusiness: false }
 */
router.post("/metadata", async (req, res) => {
  const ctx = resolveUploadContext(req);

  const photos =
    Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.photos)
        ? req.body.photos
        : [];

  if (!photos.length) {
    return res.status(400).json({ message: "No metadata provided." });
  }

  // Custom venue metadata should NOT touch Business
  if (ctx && ctx.kind === "custom") {
    return res.status(200).json({
      message: "Metadata accepted for custom venue (not saved to Business).",
      savedToBusiness: false,
    });
  }

  // Place venue requires a business doc
  const placeId = ctx?.placeId;
  if (!placeId) {
    return res.status(400).json({ message: "placeId required to save metadata to Business." });
  }

  try {
    const business = await findBusiness(placeId);

    photos.forEach((photo) => {
      business.photos.push(photo);
    });

    await business.save();

    return res.status(200).json({ message: "Metadata saved successfully.", savedToBusiness: true });
  } catch (error) {
    console.error("Error saving metadata:", error?.message || error);
    return res.status(500).json({ message: "Error saving metadata." });
  }
});

// -------------------- METADATA (LEGACY) --------------------
/**
 * POST /photos/metadata/:placeId
 * Legacy compatibility: body is array of photos
 */
router.post("/metadata/:placeId", async (req, res) => {
  // Wrap legacy format into new handler behavior
  req.body = { placeId: req.params.placeId, photos: req.body };
  return router.handle(req, res);
});

// -------------------- GET ALL BUSINESS PHOTOS --------------------
/**
 * GET /photos/:placeId/all
 * Only valid for Google Place businesses.
 */
router.get("/:placeId/all", async (req, res) => {
  const { placeId } = req.params;

  try {
    const business = await findBusiness(placeId);

    const photos = await Promise.all(
      (business.photos || []).map(async (photo) => {
        try {
          const url = await getPresignedUrl(photo.photoKey);
          return {
            photoKey: photo.photoKey,
            uploadedBy: photo.uploadedBy,
            description: photo.description,
            tags: photo.tags,
            url,
          };
        } catch (error) {
          console.error(`Error generating URL for ${photo.photoKey}:`, error?.message || error);
          return { photoKey: photo.photoKey, error: "Failed to generate URL" };
        }
      })
    );

    return res.status(200).json({ photos });
  } catch (error) {
    console.error("Error fetching photos:", error?.message || error);
    return res.status(500).json({ message: "Error fetching photos." });
  }
});

// -------------------- GET URLS BY KEYS --------------------
router.post("/photos/get-urls", async (req, res) => {
  const { photoKeys } = req.body;

  if (!Array.isArray(photoKeys) || photoKeys.length === 0) {
    return res.status(400).json({ message: "No photo keys provided." });
  }

  try {
    const presignedUrls = await Promise.all(
      photoKeys.map(async (photoKey) => {
        try {
          const url = await getPresignedUrl(photoKey);
          return { photoKey, url };
        } catch (error) {
          console.error(`Error generating URL for ${photoKey}:`, error?.message || error);
          return { photoKey, error: "Failed to generate URL" };
        }
      })
    );

    return res.status(200).json({ presignedUrls });
  } catch (error) {
    console.error("Error generating presigned URLs:", error?.message || error);
    return res.status(500).json({ message: "Error generating presigned URLs." });
  }
});

// -------------------- DELETE (PLACE) --------------------
/**
 * DELETE /photos/:placeId/:photoKey
 * This is still Business-gallery oriented.
 * It validates the key prefix so you can’t delete arbitrary objects.
 */
router.delete("/:placeId/:photoKey", async (req, res) => {
  const { placeId, photoKey } = req.params;

  const decodedKey = decodeURIComponent(photoKey);
  const allowedPrefix = `photos/${placeId}/`;

  if (!decodedKey.startsWith(allowedPrefix)) {
    return res.status(400).json({ message: "Invalid photoKey for this placeId." });
  }

  try {
    const business = await findBusiness(placeId);

    const idx = (business.photos || []).findIndex((p) => p.photoKey === decodedKey);
    if (idx === -1) {
      return res.status(404).json({ message: "Photo not found." });
    }

    await s3
      .deleteObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: decodedKey,
      })
      .promise();

    business.photos.splice(idx, 1);
    await business.save();

    return res.status(200).json({ message: "Photo deleted successfully." });
  } catch (error) {
    console.error("Error deleting photo:", error?.message || error);
    return res.status(500).json({ message: "Error deleting photo." });
  }
});

// -------------------- DELETE (CUSTOM) --------------------
/**
 * DELETE /photos/custom/:userId/:photoKey
 * For custom venue uploads (not stored on Business).
 * You MUST still protect this with auth so a user can only delete their own keys.
 */
router.delete("/custom/:userId/:photoKey", async (req, res) => {
  const { userId, photoKey } = req.params;

  const decodedKey = decodeURIComponent(photoKey);
  const allowedPrefix = `photos/custom/${userId}/`;

  if (!decodedKey.startsWith(allowedPrefix)) {
    return res.status(400).json({ message: "Invalid photoKey for this userId." });
  }

  try {
    await s3
      .deleteObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: decodedKey,
      })
      .promise();

    return res.status(200).json({ message: "Custom photo deleted successfully." });
  } catch (error) {
    console.error("Error deleting custom photo:", error?.message || error);
    return res.status(500).json({ message: "Error deleting custom photo." });
  }
});

module.exports = router;
