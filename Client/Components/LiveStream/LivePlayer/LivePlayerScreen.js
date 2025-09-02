// Components/LiveStream/Screens/LivePlayerScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { useRoute, useNavigation } from '@react-navigation/native';
import { VideoView, useVideoPlayer } from 'expo-video';

import { selectLiveById } from '../../../Slices/LiveStreamSlice';
import { getAuthHeaders } from '../../../functions';
import LiveChatOverlay from './LiveChat/LiveChatOverlay';

const API = `${process.env.EXPO_PUBLIC_API_BASE_URL}/live`;
const TAG = 'LivePlayer';

export default function LivePlayerScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { liveId } = route.params || {};
  const live = useSelector((state) => selectLiveById(state, liveId));

  const [uri, setUri] = useState(live?.playbackUrl || null);
  const [behindLiveMs, setBehindLiveMs] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  // Sticky live window: for the first N ms after load we aggressively snap to the edge
  const stickyLiveUntilRef = useRef(0);
  const didAutoCorrectRef = useRef(false);

  // Keep our freshest observed "edge" (approx duration)
  const latestPlayableRef = useRef(0);

  // ---- Player (expo-video) ----
  const player = useVideoPlayer(
    uri || null,
    useCallback((p) => {
      // Initial player config
      try {
        p.loop = false;
        p.muted = false;
        p.play(); // Start immediately; helps Android honor subsequent seeks
      } catch {}
    }, [uri])
  );

  // We'll render the VideoView only when we actually have a URI
  const hasSource = !!uri;

  // Helper: compute/snap to live edge
  const seekToLiveEdge = useCallback(
    async (padMs = 1200, reason = 'manual') => {
      try {
        if (!player) return;
        const dur = Number.isFinite(player.duration) ? player.duration : latestPlayableRef.current || 0;
        const pos = Number.isFinite(player.currentTime) ? player.currentTime : 0;
        const playable = Math.max(dur, latestPlayableRef.current || 0);

        // Heuristic "is live": duration increases over time and is not static VOD length.
        // We also rely on the presence of a small duration & growing window.
        const isProbablyLive = playable > 0 && playable - pos > 2000; // behind by >2s implies windowing

        if (!isProbablyLive) {
          console.log(`[${TAG}] seekToLiveEdge: stream is not clearly live; reason=${reason}`);
          return;
        }

        const edge = Math.max(0, playable - padMs);
        console.log(
          `[${TAG}] seekToLiveEdge:`,
          JSON.stringify({ reason, playable, edge, padMs, isPlaying: !!player.playing })
        );

        if (!player.playing) {
          await player.play();
        }
        await player.seekTo(edge / 1000); // expo-video expects seconds
      } catch (err) {
        console.warn(`[${TAG}] seekToLiveEdge error: ${String(err?.message || err)}`);
      }
    },
    [player]
  );

  // Log helper
  const log = useCallback((msg, extra) => {
    if (extra !== undefined) console.log(`[${TAG}] ${msg}:`, extra);
    else console.log(`[${TAG}] ${msg}`);
  }, []);

  // When Redux live.playbackUrl changes, update our uri
  useEffect(() => {
    if (live?.playbackUrl) {
      setUri(live.playbackUrl);
      console.log(`[${TAG}] live.playbackUrl changed -> setUri: ${live.playbackUrl}`);
    }
  }, [live?.playbackUrl]);

  // If we don't already have a playback URL, fetch it (public first, then status)
  useEffect(() => {
    if (uri) return;
    (async () => {
      try {
        const auth = await getAuthHeaders();
        const { data } = await axios
          .get(`${API}/public/${liveId}`, auth)
          .catch(async () => {
            const r = await axios.get(`${API}/status/${liveId}`, auth);
            return { data: { playbackUrl: r?.data?.status?.playbackUrl } };
          });
        if (data?.playbackUrl) {
          setUri(data.playbackUrl);
          console.log(`[${TAG}] source URI set: ${data.playbackUrl}?ts=${Date.now()}`);
        }
      } catch (e) {
        setError(e?.response?.data?.message || 'Could not load playback URL');
      }
    })();
  }, [liveId, uri]);

  // Reset local state if liveId changes (user navigated to a different live)
  useEffect(() => {
    setUri(live?.playbackUrl || null);
    setIsReady(false);
    setError(null);
    setBehindLiveMs(0);
    didAutoCorrectRef.current = false;
    latestPlayableRef.current = 0;
    stickyLiveUntilRef.current = 0;
    console.log(`[${TAG}] liveId changed -> reset local state: ${liveId}`);
  }, [liveId]);

  // Player lifecycle + status polling (expo-video doesn’t have the exact same status callbacks as expo-av)
  useEffect(() => {
    if (!player) return;

    let poll;
    let mounted = true;

    const onReady = () => {
      if (!mounted) return;
      setIsReady(true);

      // Start a sticky-live window (more aggressive auto-correction)
      const stickyMs = 2000; // shorter than expo-av version; tune as needed
      stickyLiveUntilRef.current = Date.now() + stickyMs;
      log(`Sticky live ON for ${stickyMs} ms (until = ${new Date(stickyLiveUntilRef.current).toISOString()} )`);

      // Initial edge snap after first ready tick
      // NOTE: expo-video exposes duration/currentTime in SECONDS
      setTimeout(() => seekToLiveEdge(1400, 'onReady:initial'), 10);
      // Backup snap shortly after (Android sometimes ignores the first seek)
      setTimeout(() => seekToLiveEdge(1000, 'onReady:backup250ms'), 250);
    };

    // Heuristic "ready" detection: when duration or currentTime becomes a number
    const readyCheck = () => {
      const dur = player.duration;
      const pos = player.currentTime;
      if (Number.isFinite(dur) || Number.isFinite(pos)) {
        onReady();
        return true;
      }
      return false;
    };

    // Start polling status ~2x/sec
    poll = setInterval(() => {
      try {
        const durSec = player.duration;
        const posSec = player.currentTime;
        const isPlaying = player.playing;

        if (!isReady && readyCheck()) {
          // ready handled within readyCheck
        }

        if (Number.isFinite(durSec) && Number.isFinite(posSec)) {
          const playableMs = Math.max(Math.floor(durSec * 1000), latestPlayableRef.current);
          latestPlayableRef.current = playableMs;

          const posMs = Math.floor(posSec * 1000);
          const diff = Math.max(0, playableMs - posMs);
          setBehindLiveMs(diff);

          // Log occasionally (not every tick)
          if (diff > 0 && diff % 2000 < 200) {
            log(`behindLiveMs: ${diff} pos= ${posMs} playable= ${playableMs}`);
          }

          // One-time auto-correct once we observe we’re way behind
          if (!didAutoCorrectRef.current && diff > 2500) {
            didAutoCorrectRef.current = true;
            log(`auto-correcting to live (one-time), diff= ${diff}`);
            seekToLiveEdge(1200, 'status:auto-correct');
          }

          // During sticky-live window, keep snapping forward
          if (Date.now() < stickyLiveUntilRef.current && diff > 1800) {
            seekToLiveEdge(1000, 'status:sticky-live');
          }
        }
      } catch (e) {
        // ignore
      }
    }, 500);

    return () => {
      mounted = false;
      if (poll) clearInterval(poll);
    };
  }, [player, isReady, log, seekToLiveEdge]);

  // Refresh the source URL periodically to mitigate any stale edge (optional; can be removed)
  const cacheBustingUri = useMemo(() => (uri ? `${uri}?ts=${Date.now()}` : null), [uri]);

  return (
    <View style={S.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          {!hasSource && (
            <View style={S.center}>
              <ActivityIndicator />
              <Text style={S.subtle}>Loading stream…</Text>
            </View>
          )}

          {hasSource && (
            <VideoView
              // expo-video
              style={S.video}
              player={player}
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              contentFit="contain"
              nativeControls={false}
              // key on uri to force re-mount when the stream changes
              key={cacheBustingUri}
              // Diagnostics similar to expo-av's onLoad
              onReadyForDisplay={() => {
                const dur = Number.isFinite(player?.duration) ? Math.floor(player.duration * 1000) : undefined;
                const playable = Number.isFinite(player?.duration) ? Math.floor(player.duration * 1000) : undefined;
                const heuristicLive = playable > 0 && playable < 10 * 60 * 1000; // <10min window suggests live/event DVR
                console.log(`[${TAG}] onLoad:`, JSON.stringify({ duration: dur, playable, heuristicLive }));
              }}
              onError={(e) => {
                const msg =
                  e?.nativeEvent?.error ??
                  e?.nativeEvent?.message ??
                  e?.message ??
                  'Playback error';
                setError(msg);
              }}
            />
          )}

          {behindLiveMs > 3000 && (
            <TouchableOpacity
              onPress={() => seekToLiveEdge(1000, 'tap:go-live')}
              style={S.goLive}
            >
              <Text style={S.goLiveText}>GO LIVE</Text>
            </TouchableOpacity>
          )}

          {!isReady && !error && hasSource && (
            <View style={S.loadingOverlay}>
              <ActivityIndicator />
              <Text style={S.subtle}>Connecting to live…</Text>
            </View>
          )}

          {!!error && (
            <View style={S.errorOverlay}>
              <Text style={S.errorText}>Couldn’t play the stream.</Text>
              <Text style={S.subtle}>{String(error)}</Text>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await player?.play?.();
                  } catch {}
                }}
              >
                <Text style={S.retry}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={S.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={S.back}>{'‹ Back'}</Text>
            </TouchableOpacity>
            <Text style={S.title} numberOfLines={1}>{live?.title || 'Live stream'}</Text>
            <View style={{ width: 60 }} />
          </View>
        </View>
      </TouchableWithoutFeedback>

      <LiveChatOverlay liveId={liveId} />
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  video: { width: '100%', height: '100%' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center' },
  errorOverlay: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
  errorText: { color: '#fff', fontWeight: '700', marginBottom: 6 },
  subtle: { color: '#aaa', marginTop: 6, textAlign: 'center' },
  retry: { color: '#60a5fa', marginTop: 10, fontWeight: '700' },
  topBar: {
    position: 'absolute', top: 66, left: 12, right: 12, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between'
  },
  back: { color: '#fff', fontSize: 16 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', maxWidth: '70%', textAlign: 'center' },
  goLive: {
    position: 'absolute',
    right: 12,
    bottom: 24,
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  goLiveText: { color: '#fff', fontWeight: '700' },
});
