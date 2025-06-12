import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";

export const selectMediaFromGallery = async () => {
  try {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.status !== "granted") {
      alert("Permission to access media library is required!");
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'], // Includes images & videos
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) return [];

    const enrichedAssets = await Promise.all(
      result.assets.map(async (asset) => {
        const uri = asset.uri;
        const fileName = uri.split("/").pop();
        const extension = fileName?.split(".").pop()?.toLowerCase();

        let type = "image/jpeg";
        if (extension === "mp4") type = "video/mp4";
        else if (extension === "mov") type = "video/quicktime";
        else if (extension === "jpg" || extension === "jpeg") type = "image/jpeg";
        else if (extension === "png") type = "image/png";

        let sizeMB = null;
        let durationSec = null;

        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.assetId || asset.id || "");
          sizeMB = assetInfo.size ? assetInfo.size / (1024 * 1024) : null;
          durationSec = assetInfo.duration || null;
        } catch (error) {
          console.warn("Failed to get media metadata:", error);
        }

        return {
          uri,
          name: fileName,
          type,
          sizeMB,
          durationSec,
          description: "",     // For user to annotate later
          taggedUsers: [],     // For tagging friends later
        };
      })
    );

    return enrichedAssets;
  } catch (error) {
    console.error("Error selecting media:", error);
    return [];
  }
};
