import { useVideoPlayer } from "expo-video";

export function useSmartVideoPlayer(file, shouldPlay = true) {
  // Safely resolve a URI from multiple possible shapes
  const uri =
    file?.uri ||
    file?.url ||
    file?.mediaUrl ||
    file?.mediaUploadUrl ||
    file?.signedUrl || // optional: cover more cases
    file?.playbackUrl
    "";

  const isVideo =
    !!file &&
    (
      file?.type?.startsWith?.("video/") ||
      file?.type === "hls" ||
      file?.photoKey?.toLowerCase?.().endsWith?.(".mov") ||
      file?.photoKey?.toLowerCase?.().endsWith?.(".mp4") ||
      uri?.toLowerCase?.().includes?.(".mov") ||
      uri?.toLowerCase?.().includes?.(".mp4")
    );

  // Always call the hook; pass undefined when you have no source.
  const player = useVideoPlayer(uri || undefined, (p) => {
    if (isVideo && uri) {
      p.loop = true;
      p.muted = true;
      p.volume = 0;
      p.audioMixingMode = "mixWithOthers";
      shouldPlay ? p.play() : p.pause();
    }
  });

  return player;
}
