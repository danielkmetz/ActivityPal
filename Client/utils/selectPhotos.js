import * as ImagePicker from "expo-image-picker";

export const selectPhotosFromGallery = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaType,
    allowsMultipleSelection: true,
    quality: 1,
  });

  if (result.canceled) return [];

  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.uri.split("/").pop(),
    type: asset.type || "image/jpeg",
    description: "",
    taggedUsers: [],
  }));
};
