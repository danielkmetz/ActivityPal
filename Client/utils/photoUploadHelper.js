import { uploadReviewPhotos } from "../Slices/PhotosSlice";

export const handlePhotoUpload = async ({ dispatch, userId, placeId, photos }) => {
  const newPhotos = photos.filter(photo => photo.uri && !photo.url && !photo.photoKey);
  const existingPhotos = photos.filter(photo => photo.url || photo.photoKey);

  // Format and sanitize all existing photos
  const formattedExisting = existingPhotos.map(photo => {
    const formattedTags = (photo.taggedUsers || [])
      .map(user => {
        const id = user.userId || user._id;
        if (!id || typeof id !== "string") return null;
        return {
          userId: String(id),
          x: typeof user.x === "number" ? user.x : 0,
          y: typeof user.y === "number" ? user.y : 0,
        };
      })
      .filter(Boolean);

    return {
      ...photo,
      taggedUsers: formattedTags,
    };
  });

  if (newPhotos.length === 0) {
    return formattedExisting;
  }

  let uploadResult;
  try {
    uploadResult = await dispatch(
      uploadReviewPhotos({ placeId, files: newPhotos })
    ).unwrap();
  } catch (err) {
    throw err;
  }

  const uploadedPhotos = uploadResult.map((photoKey, index) => {
    const originalPhoto = newPhotos[index];
    const formattedTags = (originalPhoto.taggedUsers || [])
      .map(user => {
        const id = user.userId || user._id;
        if (!id || typeof id !== "string") return null;
        return {
          userId: String(id),
          x: typeof user.x === "number" ? user.x : 0,
          y: typeof user.y === "number" ? user.y : 0,
        };
      })
      .filter(Boolean);

    return {
      photoKey,
      uploadedBy: userId,
      description: originalPhoto.description || "",
      taggedUsers: formattedTags,
    };
  });

  return [...formattedExisting, ...uploadedPhotos];
};
