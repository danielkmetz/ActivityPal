import { createPost, updatePost } from "../../Slices/PostsSlice";
import { createNotification } from "../../Slices/NotificationsSlice";
import { createBusinessNotification } from "../../Slices/BusNotificationsSlice";
import { handlePhotoUpload } from "../photoUploadHelper";
import { toStr } from '../Formatting/toStr';

// ---------------- tiny utils ----------------
const fullNameOf = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "Someone";

const normalizeId = (u) => u?._id || u?.userId || u?.id;

const safeStringify = (v) => {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

// ---------------- errors ----------------
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

// ---------------- media upload ----------------
export async function uploadDedupPhotos({ dispatch, userId, placeId, photos }) {
  if (!Array.isArray(photos) || photos.length === 0) return [];

  const seen = new Set();
  const deduped = [];

  for (const p of photos) {
    // pick the most stable key we have
    const k = p?.photoKey || p?.uri || p?.localKey || p?._id || JSON.stringify(p);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(p);
  }

  // If there's no placeId (custom venue), we still need a stable folder-ish id
  // so uploads don't crash. This does NOT leak anything sensitive.
  const safePlaceId = placeId || `custom-${toStr(userId)}` || "custom";

  return handlePhotoUpload({ dispatch, userId, placeId: safePlaceId, photos: deduped });
}

// ---------------- notifications ----------------
export async function notifyAll({
  dispatch,
  fullName,
  currentUserId,
  placeId,
  businessName,
  postType,
  postId,
  taggedUsers,
  uploadedPhotos,
}) {
  const tagList = Array.isArray(taggedUsers) ? taggedUsers : [];
  const mediaList = Array.isArray(uploadedPhotos) ? uploadedPhotos : [];

  const postTagPromises = tagList.map((tu) =>
    dispatch(
      createNotification({
        userId: normalizeId(tu),
        type: "tag",
        message: `${fullName} tagged you in a ${postType}!`,
        relatedId: currentUserId,
        typeRef: "User",
        targetId: postId,
        postType,
      })
    )
  );

  const photoTagPromises = mediaList.flatMap((photo) =>
    (photo?.taggedUsers || []).map((u) =>
      dispatch(
        createNotification({
          userId: normalizeId(u),
          type: "photoTag",
          message: `${fullName} tagged you in a photo!`,
          relatedId: currentUserId,
          typeRef: "User",
          targetId: postId,
          postType,
        })
      )
    )
  );

  // Only notify a business if we actually have a placeId.
  const businessPromise = placeId
    ? dispatch(
        createBusinessNotification({
          placeId,
          postType,
          type: postType,
          message: `${fullName} ${
            postType === "review" ? "left a review on" : postType === "check-in" ? "checked in at" : "posted about"
          } ${businessName}`,
          relatedId: currentUserId,
          typeRef: "User",
          targetId: postId,
          targetRef: "Post",
        })
      )
    : Promise.resolve();

  return Promise.all([...postTagPromises, ...photoTagPromises, businessPromise]);
}

// ---------------- payload builders ----------------
export function buildUpdatePayload({
  postType,
  placeId,
  taggedUserIds,
  uploadedPhotos,
  rating,
  wouldGoBack,
  priceRating,
  vibeTags,
  message,
}) {
  const base = {
    placeId: placeId || null,
    taggedUsers: taggedUserIds,
    photos: uploadedPhotos,
  };

  if (postType === "review") {
    return {
      ...base,
      rating,
      wouldGoBack,
      priceRating: priceRating ?? null,
      vibeTags: Array.isArray(vibeTags) ? vibeTags : [],
      reviewText: message || null,
      message: message || null,
    };
  }

  // check-in / invite / etc
  return { ...base, message: message || null };
}

export function buildCreatePayload({
  postType,
  userId,
  placeId,
  businessName,
  location,
  taggedUserIds,
  uploadedPhotos,
  relatedInviteId,
  venue, // optional (useful for invites)
  rating,
  wouldGoBack,
  priceRating,
  vibeTags,
  message,
  extra, // optional extension point
}) {
  const payload = {
    type: postType,
    userId,
    placeId: placeId || null,
    location: location || "",
    businessName: businessName || "",
    photos: uploadedPhotos,
    taggedUsers: taggedUserIds,
    ...(relatedInviteId ? { relatedInviteId } : {}),
    ...(venue ? { venue } : {}),
    ...(extra && typeof extra === "object" ? extra : {}),
  };

  if (postType === "review") {
    return {
      ...payload,
      message: message || null,
      reviewText: message || null,
      rating,
      wouldGoBack,
      priceRating: priceRating ?? null,
      vibeTags: Array.isArray(vibeTags) ? vibeTags : [],
    };
  }

  return { ...payload, message: message || null };
}

// ---------------- main orchestrator ----------------
export async function submitPost({
  dispatch,
  user,
  isEditing,
  initialPost,
  postType,
  business,
  inviteVenue,
  media,
  taggedUsers,
  rating,
  wouldGoBack,
  priceRating,
  vibeTags,
  reviewText,
  checkInMessage,
  relatedInviteId,
  extraCreatePayload, // optional extension point
}) {
  const currentUserId = user?.id || user?._id;
  const fullName = fullNameOf(user);

  if (!currentUserId) {
    throw new Error("Missing user id.");
  }

  // ---- derive place/business fields ----
  // For invites, prefer inviteVenue (place OR custom). For review/check-in, use business place.
  const isInvite = postType === "invite";
  const isReview = postType === "review";
  const isCheckIn = postType === "check-in";

  let placeId = null;
  let businessName = "";
  let location = "";

  if (isInvite) {
    if (!inviteVenue) {
      throw new Error("Please choose a venue for your invite.");
    }

    // inviteVenue from your venueBuilder:
    // { kind: 'place'|'custom', label, placeId?, address?, geo? }
    businessName = toStr(inviteVenue?.label).trim();
    location = toStr(inviteVenue?.address).trim();
    placeId = inviteVenue?.kind === "place" ? toStr(inviteVenue?.placeId).trim() : null;

    if (!businessName) throw new Error("Please add a venue name for your invite.");
  } else {
    placeId = toStr(business?.place_id).trim();
    businessName = toStr(business?.name).trim();
    location = toStr(business?.formatted_address).trim();

    if (!placeId) {
      throw new Error("Please choose a place.");
    }
  }

  // ---- validation for review ----
  if (isReview) {
    if (!rating || !wouldGoBack) {
      throw new Error("Please add an overall rating and whether you'd go back.");
    }
  }

  const trimmedReview = toStr(reviewText).trim();
  const trimmedCheckIn = toStr(checkInMessage).trim();

  const message = isReview ? trimmedReview : isCheckIn ? trimmedCheckIn : toStr(checkInMessage || reviewText).trim();

  // ---- upload media ----
  const rawPhotos = Array.isArray(media) ? media : [];
  const uploadedPhotos = await uploadDedupPhotos({
    dispatch,
    userId: currentUserId,
    placeId, // may be null for custom invites; uploadDedupPhotos handles fallback
    photos: rawPhotos,
  });

  const taggedUserIds = (Array.isArray(taggedUsers) ? taggedUsers : [])
    .map(normalizeId)
    .filter(Boolean);

  // ---- create/update ----
  let postId;
  let mode;

  if (isEditing && initialPost?._id) {
    const updates = buildUpdatePayload({
      postType,
      placeId,
      taggedUserIds,
      uploadedPhotos,
      rating,
      wouldGoBack,
      priceRating,
      vibeTags,
      message: message || null,
    });

    await dispatch(updatePost({ postId: initialPost._id, updates })).unwrap();
    postId = initialPost._id;
    mode = "update";
  } else {
    const payload = buildCreatePayload({
      postType,
      userId: currentUserId,
      placeId,
      businessName,
      location,
      taggedUserIds,
      uploadedPhotos,
      relatedInviteId,
      venue: isInvite ? inviteVenue : null,
      rating,
      wouldGoBack,
      priceRating,
      vibeTags,
      message: message || null,
      extra: extraCreatePayload,
    });

    const created = await dispatch(createPost(payload)).unwrap();
    postId = created?._id;
    mode = "create";
  }

  // ---- notifications ----
  await notifyAll({
    dispatch,
    fullName,
    currentUserId,
    placeId,
    businessName,
    postType,
    postId,
    taggedUsers,
    uploadedPhotos,
  });

  return { postId, mode };
}
