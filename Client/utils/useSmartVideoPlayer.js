import { useEffect } from 'react';
import { useVideoPlayer } from 'expo-video';
import { isVideo as isVideoUtil } from './isVideo';

const TAG = '[useSmartVideoPlayer]';

export function useSmartVideoPlayer(file, shouldPlay = true) {
  const isStringSource = typeof file === 'string';
  const obj =
    file && typeof file === 'object' && !Array.isArray(file) ? file : null;
  const details = obj?.details || {};

  const uri =
    // 1) Direct URL passed in (playbackUrl string, etc.)
    (isStringSource ? file : null) ||

    // 2) Existing object-based sources
    obj?.uri ||
    obj?.url ||
    obj?.mediaUrl ||
    obj?.mediaUploadUrl ||
    obj?.signedUrl ||
    obj?.vodUrl ||
    obj?.playbackUrl ||
    details?.playbackUrl ||
    details?.url ||
    details?.mediaUrl ||
    '';

  const isVid = !!file && isVideoUtil(file);
  const source = isVid && uri ? uri : undefined;

  const player = useVideoPlayer(source, (p) => {
    try {
      // play only once
      p.loop = false;
      p.muted = true;
      p.volume = 0;
      p.audioMixingMode = 'mixWithOthers';
      // don't rely on shouldPlay here; we’ll manage that in an effect
      p.pause();
    } catch (err) {
      console.error(TAG, 'error in init callback', err);
    }
  });

  // 🔹 React to visibility / shouldPlay changes
  useEffect(() => {
    if (!player) return;

    if (!isVid || !source) {
      player.pause();
      return;
    }

    try {
      if (shouldPlay) {
        player.play();
      } else {
        // pause and rewind so it restarts next time it becomes visible
        player.pause();
        player.currentTime = 0;
      }
    } catch (err) {
      console.error(TAG, 'error in shouldPlay effect', err);
    }
  }, [player, isVid, source, shouldPlay]);

  return isVid ? player : null;
}
