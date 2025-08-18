import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";

export const selectMediaFromGallery = async () => {
  try {
    // Request Image Picker's media library permission
    const pickerPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (pickerPerm.status !== "granted") {
      alert("Permission to access media library is required!");
      return [];
    }

    // (Optional but recommended) Ensure MediaLibrary permission before getAssetInfoAsync
    let mediaPerm = await MediaLibrary.getPermissionsAsync();
    if (mediaPerm.status !== "granted") {
      mediaPerm = await MediaLibrary.requestPermissionsAsync();
      if (mediaPerm.status !== "granted") {
        // We'll still return basic assets without metadata
        console.warn("MediaLibrary permission not granted; skipping metadata enrichment.");
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 1,
      // selectionLimit: 10, // (iOS 14+ only, if you want to cap selections)
    });

    if (result.canceled) return [];

    const enrichedAssets = await Promise.all(
      (result.assets || []).map(async (asset) => {
        const uri = asset.uri;
        const fileName = uri?.split("/").pop() || "upload";
        const ext = (fileName.split(".").pop() || "").toLowerCase();

        let type = asset.type === "video" ? "video/mp4" : "image/jpeg";
        if (ext === "mov") type = "video/quicktime";
        if (ext === "png") type = "image/png";
        if (ext === "jpg" || ext === "jpeg") type = "image/jpeg";

        let sizeMB = null;
        let durationSec = null;

        // Only call getAssetInfoAsync when we have a valid ID AND permission
        const id = asset.assetId || asset.id;
        if (id && mediaPerm.status === "granted") {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(id);
            sizeMB = info.size ? info.size / (1024 * 1024) : null;
            durationSec = info.duration ?? null;
          } catch (e) {
            console.warn("Failed to get media metadata:", e);
          }
        }

        return {
          uri,
          name: fileName,
          type,
          sizeMB,
          durationSec,
          description: "",
          taggedUsers: [],
        };
      })
    );

    return enrichedAssets;
  } catch (error) {
    console.error("Error selecting media:", error);
    return [];
  }
};
