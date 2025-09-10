import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Handles expo-video live behavior:
 * - readiness + live-edge autocorrect loop
 * - behindLiveMs tracking
 * - seekToLiveEdge + onGoLivePress helpers
 * Call this ONLY when using expo-video (not IVS).
 */
export default function useExpoLivePlayback({ player, log }) {
  const [isReady, setIsReady] = useState(false);
  const [behindLiveMs, setBehindLiveMs] = useState(0);

  const stickyLiveUntilRef = useRef(0);
  const didAutoCorrectRef = useRef(false);
  const latestPlayableSecRef = useRef(0);

  const seekToLiveEdge = useCallback(async (padSec = 1.2, reason = 'manual') => {
    try {
      if (!player) return;
      const durSec = Number.isFinite(player.duration)
        ? player.duration
        : latestPlayableSecRef.current || 0;
      const posSec = Number.isFinite(player.currentTime) ? player.currentTime : 0;
      const playableSec = Math.max(durSec, latestPlayableSecRef.current || 0);

      const isProbablyLive = playableSec > 0 && (playableSec - posSec) > 2;
      if (!isProbablyLive) {
        log?.(`[useExpoLivePlayback] seekToLiveEdge: not clearly live; reason=${reason}`);
        return;
      }

      const edgeSec = Math.max(0, playableSec - padSec);
      log?.(`[useExpoLivePlayback] seekToLiveEdge`, { reason, playableSec, edgeSec, padSec, isPlaying: !!player.playing });

      if (!player.playing) await player.play();
      player.currentTime = edgeSec;
    } catch (err) {
      console.warn('[useExpoLivePlayback] seekToLiveEdge error:', String(err?.message || err));
    }
  }, [player, log]);

  // Status/seek loop
  useEffect(() => {
    if (!player) return;

    let poll;
    let mounted = true;

    const onReady = () => {
      if (!mounted) return;
      setIsReady(true);
      const stickyMs = 2000;
      stickyLiveUntilRef.current = Date.now() + stickyMs;
      log?.(`[useExpoLivePlayback] Sticky live ON for ${stickyMs} ms`);
      setTimeout(() => seekToLiveEdge(1.4, 'onReady:initial'), 10);
      setTimeout(() => seekToLiveEdge(1.0, 'onReady:backup250ms'), 250);
    };

    const readyCheck = () => {
      const dur = player.duration;
      const pos = player.currentTime;
      if (Number.isFinite(dur) || Number.isFinite(pos)) {
        onReady();
        return true;
      }
      return false;
    };

    poll = setInterval(() => {
      try {
        const durSec = player.duration;
        const posSec = player.currentTime;

        if (!isReady && readyCheck()) {
          // handled in readyCheck
        }

        if (Number.isFinite(durSec) && Number.isFinite(posSec)) {
          const playableSec = Math.max(durSec, latestPlayableSecRef.current);
          latestPlayableSecRef.current = playableSec;
          const diffSec = Math.max(0, playableSec - posSec);
          setBehindLiveMs(Math.floor(diffSec * 1000));

          if (!didAutoCorrectRef.current && diffSec > 2.5) {
            didAutoCorrectRef.current = true;
            log?.('[useExpoLivePlayback] auto-correcting to live (one-time)', { diffSec });
            seekToLiveEdge(1.2, 'status:auto-correct');
          }

          if (Date.now() < stickyLiveUntilRef.current && diffSec > 1.8) {
            seekToLiveEdge(1.0, 'status:sticky-live');
          }
        }
      } catch {}
    }, 500);

    return () => {
      mounted = false;
      if (poll) clearInterval(poll);
    };
  }, [player, isReady, log, seekToLiveEdge]);

  // iOS target offset hint
  useEffect(() => {
    if (!player) return;
    if (Platform.OS === 'ios') {
      player.targetOffsetFromLive = 1.5;
    }
  }, [player]);

  const onGoLivePress = useCallback(() => seekToLiveEdge(1.0, 'tap:go-live'), [seekToLiveEdge]);

  return { isReady, behindLiveMs, onGoLivePress, seekToLiveEdge };
}
