import { handlePhotoUpload } from "../photoUploadHelper";

function safeStringify(v) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/**
 * Reuse the same error extraction behavior as your post submit flow.
 */
export function extractErrMessage(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (err?.message) return err.message;

  const axiosMsg =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.response?.data ||
    err?.response?.statusText;

  if (axiosMsg) return typeof axiosMsg === "string" ? axiosMsg : safeStringify(axiosMsg);

  if (err?.payload) {
    if (typeof err.payload === "string") return err.payload;
    if (err.payload?.message) return err.payload.message;
    return safeStringify(err.payload);
  }

  if (err?.error) return typeof err.error === "string" ? err.error : safeStringify(err.error);

  return safeStringify(err);
}

export function dedupeMedia(media) {
  const list = Array.isArray(media) ? media : [];
  if (!list.length) return [];

  const seen = new Set();
  const deduped = [];

  for (const m of list) {
    const rawKey =
      m?.photoKey ||
      m?.videoKey ||
      m?.localKey ||
      m?.uri ||
      m?._id ||
      m?.id ||
      safeStringify(m);

    const key = String(rawKey);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(m);
  }

  return deduped;
}

/**
 * Builds the final invite payload sent through your conflict-aware actions.
 * Includes legacy fields for backwards compatibility.
 */
export function buildInvitePayload({ venue, dateTime, message, isPublic, media, recipientIds }) {
  const photos = Array.isArray(media) ? media : [];

  const legacyPlaceId = venue?.kind === "place" ? venue?.placeId || null : null;
  const legacyBusinessName = venue?.label || null;

  return {
    venue,                     // ✅ new schema
    placeId: legacyPlaceId,    // legacy
    businessName: legacyBusinessName, // legacy
    dateTime,
    message: message || null,
    isPublic: isPublic === true,
    photos,
    recipientIds: Array.isArray(recipientIds) ? recipientIds : [],
  };
}

/**
 * Upload invite media (photos/videos) and return uploaded array.
 * Uses venue when available; placeId only as fallback for older uploader versions.
 */
export async function uploadInviteMedia({ dispatch, userId, venue, media }) {
  const deduped = dedupeMedia(media);
  if (!deduped.length) return [];

  const fallbackPlaceId = venue?.kind === "place" ? venue?.placeId : null;

  return handlePhotoUpload({
    dispatch,
    userId,
    placeId: fallbackPlaceId,
    venue,              // 👈 support custom venues
    photos: deduped,
    postType: "invite",
  });
}

/**
 * Orchestrates:
 * - upload media
 * - build payload
 * - call send/edit conflict action
 *
 * @param mode "create" | "edit"
 * @param actions { sendInviteWithConflicts, editInviteWithConflicts }
 * @param payload { userId, venue, dateTime, message, isPublic, media, recipientIds }
 */
export async function submitInvite({ dispatch, mode, inviteId, actions, payload }) {
  const sendFn = actions?.sendInviteWithConflicts;
  const editFn = actions?.editInviteWithConflicts;

  if (typeof dispatch !== "function") throw new Error("submitInvite: dispatch missing");
  if (mode !== "create" && mode !== "edit") throw new Error("submitInvite: invalid mode");
  if (!payload?.userId) throw new Error("User not loaded. Please try again.");
  if (!payload?.venue?.label) throw new Error("Please choose a location.");
  if (!payload?.dateTime) throw new Error("Please choose a date & time.");

  const recipientIds = Array.isArray(payload?.recipientIds) ? payload.recipientIds : [];
  if (!recipientIds.length) throw new Error("Please select at least one friend.");

  if (payload?.venue?.kind === "place" && !payload?.venue?.placeId) {
    throw new Error("Please choose a place.");
  }

  if (mode === "edit" && !inviteId) {
    throw new Error("Missing invite id for edit.");
  }

  // 1) upload
  const uploaded = await uploadInviteMedia({
    dispatch,
    userId: payload.userId,
    venue: payload.venue,
    media: payload.media,
  });

  // 2) build final payload
  const finalPayload = buildInvitePayload({
    venue: payload.venue,
    dateTime: payload.dateTime,
    message: payload.message,
    isPublic: payload.isPublic,
    media: uploaded,
    recipientIds,
  });

  // 3) call conflicts action
  if (mode === "edit") {
    if (typeof editFn !== "function") throw new Error("Edit invite action missing.");

    const { recipientIds: rids, ...updates } = finalPayload;
    const res = await editFn({
      inviteIdOverride: inviteId,
      updates,
      recipientIds: rids,
    });

    return {
      cancelled: !!res?.cancelled,
      mode,
      payload: finalPayload,
    };
  }

  // create
  if (typeof sendFn !== "function") throw new Error("Send invite action missing.");

  const res = await sendFn(finalPayload);

  return {
    cancelled: !!res?.cancelled,
    mode,
    payload: finalPayload,
  };
}
