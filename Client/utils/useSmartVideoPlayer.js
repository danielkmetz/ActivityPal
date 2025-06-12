import { useVideoPlayer } from "expo-video";

export function useSmartVideoPlayer(file, shouldPlay = true) {
  const uri = file?.uri || file?.url || file.mediaUrl || file.mediaUploadUrl || "";

  const isVideo =
    typeof file === "object" &&
    (file?.type?.startsWith("video/") ||
      file?.photoKey?.toLowerCase?.().endsWith(".mov") ||
      file?.photoKey?.toLowerCase?.().endsWith(".mp4") ||
      uri?.toLowerCase?.().includes(".mov") ||
      uri?.toLowerCase?.().includes(".mp4"));
  
  // Always call the hook — pass null if not a video
  return useVideoPlayer(uri || null, (player) => {
    if (isVideo && uri) {
      player.loop = true;
      player.muted = true;
      player.volume = 0;
      player.audioMixingMode = 'mixWithOthers'; 

      if (shouldPlay) {
        player.play();
      } else {
        player.pause(); // explicitly prevent autoplay
      }
    }
  });
}
