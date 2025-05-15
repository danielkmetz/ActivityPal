import { uploadReviewPhotos } from "../Slices/PhotosSlice";

// Helper to create a unique local key for matching
const generateLocalKey = (photo) => photo.uri || photo.localUri || photo.name;

export const handlePhotoUpload = async ({ dispatch, userId, placeId, photos }) => {
  // Add localKey to help track position/order
  const photosWithKeys = photos.map(p => ({
    ...p,
    localKey: generateLocalKey(p),
  }));

  const newPhotos = photosWithKeys.filter(photo => photo.uri && !photo.url && !photo.photoKey);
  const existingPhotos = photosWithKeys.filter(photo => photo.url || photo.photoKey);

  const formattedExisting = existingPhotos.map(photo => {
    const formattedTags = (photo.taggedUsers || []).map(user => {
      const id = user.userId || user._id;
      if (!id || typeof id !== "string") return null;
      return {
        userId: String(id),
        x: typeof user.x === "number" ? user.x : 0,
        y: typeof user.y === "number" ? user.y : 0,
      };
    }).filter(Boolean);

    return {
      ...photo,
      taggedUsers: formattedTags,
    };
  });

  let uploadedPhotos = [];

  if (newPhotos.length > 0) {
    let uploadResult;
    try {
      uploadResult = await dispatch(
        uploadReviewPhotos({ placeId, files: newPhotos })
      ).unwrap();
    } catch (err) {
      throw err;
    }

    uploadedPhotos = uploadResult.map((photoKey, index) => {
      const originalPhoto = newPhotos[index];
      const formattedTags = (originalPhoto.taggedUsers || []).map(user => {
        const id = user.userId || user._id;
        if (!id || typeof id !== "string") return null;
        return {
          userId: String(id),
          x: typeof user.x === "number" ? user.x : 0,
          y: typeof user.y === "number" ? user.y : 0,
        };
      }).filter(Boolean);

      return {
        localKey: originalPhoto.localKey, // to match back in original order
        photoKey,
        uploadedBy: userId,
        description: originalPhoto.description || "",
        taggedUsers: formattedTags,
      };
    });
  }

  // Merge and preserve order
  return photosWithKeys.map(photo => {
    return (
      uploadedPhotos.find(p => p.localKey === photo.localKey) ||
      formattedExisting.find(p => p.localKey === photo.localKey) ||
      photo
    );
  });
};
