import { uploadReviewPhotos } from "../Slices/PhotosSlice";

// Improved helper to create a unique local key for matching
const generateLocalKey = (photo) =>
  photo.localKey ||
  photo.photoKey ||
  photo.uri ||
  photo.localUri ||
  photo.name ||
  photo._id ||
  `${Math.random()}`; // fallback to prevent undefined keys

export const handlePhotoUpload = async ({ dispatch, userId, placeId, photos }) => {
  // Normalize and assign unique localKeys
  const photosWithKeys = photos.map(p => ({
    ...p,
    localKey: generateLocalKey(p),
  }));

  const newPhotos = photosWithKeys.filter(photo => photo.uri && !photo.url && !photo.photoKey);
  const existingPhotos = photosWithKeys.filter(photo => photo.url || photo.photoKey);

  const formattedExisting = existingPhotos.map(photo => {
    const formattedTags = (photo.taggedUsers || []).map(user => {
      const id = user.userId || user._id;
      return id ? { userId: String(id), x: user.x || 0, y: user.y || 0 } : null;
    }).filter(Boolean);

    return {
      ...photo,
      taggedUsers: formattedTags,
    };
  });

  let uploadedPhotos = [];

  if (newPhotos.length > 0) {
    try {
      const uploadResult = await dispatch(
        uploadReviewPhotos({ placeId, files: newPhotos })
      ).unwrap();

      uploadedPhotos = uploadResult.map((photoKey, index) => {
        const originalPhoto = newPhotos[index];
        const formattedTags = (originalPhoto.taggedUsers || []).map(user => {
          const id = user.userId || user._id;
          return id ? { userId: String(id), x: user.x || 0, y: user.y || 0 } : null;
        }).filter(Boolean);

        return {
          localKey: originalPhoto.localKey,
          photoKey,
          uploadedBy: userId,
          description: originalPhoto.description || "",
          taggedUsers: formattedTags,
        };
      });
    } catch (err) {
      throw err;
    }
  }

  // Merge preserving order and removing duplicates based on localKey
  const usedKeys = new Set();
  const finalMerged = photosWithKeys.map(photo => {
    const key = photo.localKey;

    if (usedKeys.has(key)) return null;
    usedKeys.add(key);

    return (
      uploadedPhotos.find(p => p.localKey === key) ||
      formattedExisting.find(p => p.localKey === key) ||
      photo
    );
  }).filter(Boolean);

  return finalMerged;
};
