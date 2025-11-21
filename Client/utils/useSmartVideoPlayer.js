import { useVideoPlayer } from 'expo-video';
import { isVideo as isVideoUtil } from './isVideo';

const TAG = '[useSmartVideoPlayer]';

export function useSmartVideoPlayer(file, shouldPlay = true) {
  const details = file?.details || {};

  const uri =
    file?.uri ||
    file?.url ||
    file?.mediaUrl ||
    file?.mediaUploadUrl ||
    file?.signedUrl ||
    file?.vodUrl ||
    file?.playbackUrl ||
    details?.playbackUrl ||
    details?.url ||
    details?.mediaUrl ||
    '';

  const isVid = !!file && isVideoUtil(file);

  // Only give expo-video a source if this is truly a video
  const source = isVid && uri ? uri : undefined;

  console.log(TAG, 'init', {
    hasFile: !!file,
    isVideo: isVid,
    uri: source || uri,  // helpful to see what would have been used
    shouldPlay,
  });

  const player = useVideoPlayer(source, (p) => {
    try {
      if (isVid && source) {
        p.loop = true;
        p.muted = true;
        p.volume = 0;
        p.audioMixingMode = 'mixWithOthers';
        shouldPlay ? p.play() : p.pause();
      } else {
        // Non-video: make sure nothing is playing
        p.pause();
      }
    } catch (err) {
      console.error(TAG, 'error in init callback', err);
    }
  });

  // For non-video callers, this tells them "no player"
  return isVid ? player : null;
}
