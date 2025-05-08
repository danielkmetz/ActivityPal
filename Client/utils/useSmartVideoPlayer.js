import { useVideoPlayer } from "expo-video";

export function useSmartVideoPlayer(file) {
  const uri = file?.uri || file?.url || "";

  const isVideo =
    typeof file === "object" &&
    (file?.type?.startsWith("video/") ||
      file?.photoKey?.toLowerCase?.().endsWith(".mov") ||
      file?.photoKey?.toLowerCase?.().endsWith(".mp4") ||
      uri?.toLowerCase?.().includes(".mov") ||
      uri?.toLowerCase?.().includes(".mp4"));

  // Always call the hook — pass null if not a video
  return useVideoPlayer(isVideo ? uri : null, (player) => {
    if (isVideo && uri) {
      player.loop = true;
      player.muted = true;
      player.play();
    }
  });
}
