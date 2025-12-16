import { uploadReviewPhotos } from "../Slices/PhotosSlice";

// ----------------- helpers -----------------
const safeString = (v) => (typeof v === "string" ? v : "");

const inferExtFromUri = (uri = "") => {
  const clean = safeString(uri).split("?")[0];
  const lastDot = clean.lastIndexOf(".");
  if (lastDot === -1) return null;
  return clean.slice(lastDot + 1).toLowerCase();
};

const inferMime = ({ mediaType, uri, type, mimeType }) => {
  const existing = type || mimeType;
  if (existing) return existing;

  const ext = inferExtFromUri(uri);
  const mt = mediaType === "video" ? "video" : "image";

  if (mt === "video") {
    if (ext === "mov") return "video/quicktime";
    return "video/mp4"; // default
  }

  // image defaults
  if (ext === "png") return "image/png";
  if (ext === "heic") return "image/heic";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
};

const inferName = ({ name, fileName, uri, mediaType }) => {
  if (name) return name;
  if (fileName) return fileName;

  const clean = safeString(uri).split("?")[0];
  const lastSlash = clean.lastIndexOf("/");
  const base = lastSlash !== -1 ? clean.slice(lastSlash + 1) : clean;

  if (base && base.includes(".")) return base;

  const ext = inferExtFromUri(uri) || (mediaType === "video" ? "mp4" : "jpg");
  return `upload_${Date.now()}.${ext}`;
};

// Improved helper to create a unique local key for matching
const generateLocalKey = (m) =>
  m?.localKey ||
  m?.photoKey ||
  m?.uri ||
  m?.localUri ||
  m?.name ||
  m?.fileName ||
  m?._id ||
  `${Date.now()}_${Math.random()}`;

// Tagged users normalization stays the same
const normalizeTags = (taggedUsers) =>
  (Array.isArray(taggedUsers) ? taggedUsers : [])
    .map((user) => {
      const id = user?.userId || user?._id || user?.id;
      return id
        ? { userId: String(id), x: user?.x || 0, y: user?.y || 0 }
        : null;
    })
    .filter(Boolean);

const normalizeMedia = (m) => {
  const uri = m?.uri || m?.localUri;
  const mediaType =
    m?.mediaType ||
    (typeof m?.type === "string" && m.type.startsWith("video") ? "video" : "photo");

  const mime = inferMime({ mediaType, uri, type: m?.type, mimeType: m?.mimeType });
  const name = inferName({ name: m?.name, fileName: m?.fileName, uri, mediaType });
  const localKey = generateLocalKey({ ...m, uri, name });

  return {
    ...m,
    uri,
    mediaType,
    // IMPORTANT: upload thunk likely expects these:
    type: mime,
    mimeType: mime,
    name,
    fileName: name,
    localKey,
    taggedUsers: normalizeTags(m?.taggedUsers),
  };
};

// ----------------- main -----------------
export const handlePhotoUpload = async ({ dispatch, userId, placeId, photos }) => {
  const list = Array.isArray(photos) ? photos : [];

  // Normalize everything (photos + videos) into a consistent shape
  const normalized = list.map(normalizeMedia);

  // "New" = local uri only, not already uploaded
  const newFiles = normalized.filter((m) => m?.uri && !m?.url && !m?.photoKey);
  const existingFiles = normalized.filter((m) => m?.url || m?.photoKey);

  let uploaded = [];

  if (newFiles.length > 0) {
    // uploadReviewPhotos must accept mixed media; it now receives { uri, name, type }
    const uploadResult = await dispatch(
      uploadReviewPhotos({ placeId, files: newFiles })
    ).unwrap();

    // uploadResult assumed to be an array of keys in the SAME ORDER
    uploaded = (Array.isArray(uploadResult) ? uploadResult : []).map((photoKey, index) => {
      const original = newFiles[index] || {};
      return {
        localKey: original.localKey,
        photoKey,
        uploadedBy: userId,
        description: original.description || "",
        taggedUsers: normalizeTags(original.taggedUsers),
        mediaType: original.mediaType, // <-- keep video vs photo
        // keep mime for rendering decisions if needed
        type: original.type,
        mimeType: original.mimeType,
      };
    });
  }

  // Merge preserving original order, dedupe by localKey
  const usedKeys = new Set();

  const finalMerged = normalized
    .map((m) => {
      const key = m?.localKey;
      if (!key || usedKeys.has(key)) return null;
      usedKeys.add(key);

      return (
        uploaded.find((u) => u.localKey === key) ||
        existingFiles.find((e) => e.localKey === key) ||
        m
      );
    })
    .filter(Boolean);

  return finalMerged;
};
