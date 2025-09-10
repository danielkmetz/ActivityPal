import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerState } from 'amazon-ivs-react-native-player';

/**
 * Handles IVS player:
 * - exposes onIVSStateChange to set readiness and detect "ENDED"
 * - exposes goLive() to jump to live and play
 * - tracks behindLiveMs via IVS latency API
 */
export default function useIvsPlayback({ ivsRef, onEnded }) {
  const [isReady, setIsReady] = useState(false);
  const [behindLiveMs, setBehindLiveMs] = useState(0);
  const endedOnceRef = useRef(false);

  const safeEnd = useCallback(() => {
    if (endedOnceRef.current) return;
    endedOnceRef.current = true;
    onEnded?.();
  }, [onEnded]);

  const goLive = useCallback(async () => {
    try {
      const api = ivsRef?.current;
      if (api?.seekToLive) await api.seekToLive();
      if (api?.setLiveLowLatency) await api.setLiveLowLatency(true);
      if (api?.play) await api.play();
    } catch (e) {
      console.warn('[useIvsPlayback] goLive error', e?.message || e);
    }
  }, [ivsRef]);

  const onIVSStateChange = useCallback((state) => {
    const s = typeof state === 'string' ? state.toUpperCase() : state;
    const ready =
      s === PlayerState.Ready ||
      s === PlayerState.Playing ||
      s === 'READY' ||
      s === 'PLAYING';
    setIsReady(ready);

    if (s === PlayerState.Ended || s === 'ENDED') {
      safeEnd();
    }
  }, [safeEnd]);

  // Poll IVS latency -> behindLiveMs
  useEffect(() => {
    let id;
    id = setInterval(async () => {
      try {
        const api = ivsRef?.current;
        if (api?.getLiveLatency) {
          const sec = await api.getLiveLatency();
          if (Number.isFinite(sec)) setBehindLiveMs(Math.max(0, sec * 1000));
        }
      } catch {}
    }, 500);
    return () => clearInterval(id);
  }, [ivsRef]);

  return { isReady, behindLiveMs, onIVSStateChange, goLive };
}
