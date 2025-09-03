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
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { useRoute, useNavigation } from '@react-navigation/native';
import { VideoView, useVideoPlayer } from 'expo-video';
import IVSPlayer from 'amazon-ivs-react-native-player';
import { selectLiveById } from '../../../Slices/LiveStreamSlice';
import { getAuthHeaders } from '../../../functions';
import LiveChatOverlay from './LiveChat/LiveChatOverlay';
import { useLiveChatSession } from '../useLiveChatSession';

const API = `${process.env.EXPO_PUBLIC_API_BASE_URL}/live`;
const TAG = 'LivePlayer';

// Simple detector: treat *.live-video.net or ivs.* as IVS
const isIVSUrl = (url) => typeof url === 'string' && /(live-video\.net|ivs\.)/i.test(url);

export default function LivePlayerScreen() {
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const KB_OFFSET = (insets?.bottom || 0) + 8;
  const { liveId } = route.params || {};
  const live = useSelector((state) => selectLiveById(state, liveId));
  const [uri, setUri] = useState(live?.playbackUrl || null);
  const [behindLiveMs, setBehindLiveMs] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [showChat, setShowChat] = useState(true);
  // Sticky live window (expo-video path)
  const stickyLiveUntilRef = useRef(0);
  const didAutoCorrectRef = useRef(false);
  const latestPlayableSecRef = useRef(0);
  const useIVS = isIVSUrl(uri);
  const ivsRef = useRef(null); // IVS player ref

  useLiveChatSession(liveId, { baseUrl: 'http://10.0.0.24:5000' });

  // ---- expo-video player (fallback / non-IVS) ----
  const player = useVideoPlayer(
    useIVS ? null : (uri || null),
    useCallback((p) => {
      if (!p) return;
      try {
        p.loop = false;
        p.muted = false;
        p.play();
      } catch { }
    }, [useIVS, uri])
  );

  const hasSource = !!uri;

  // --- Shared logging ---
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

  // Reset local state if liveId changes
  useEffect(() => {
    setUri(live?.playbackUrl || null);
    setIsReady(false);
    setError(null);
    setBehindLiveMs(0);
    didAutoCorrectRef.current = false;
    latestPlayableSecRef.current = 0;
    stickyLiveUntilRef.current = 0;
    console.log(`[${TAG}] liveId changed -> reset local state: ${liveId}`);
  }, [liveId]);

  // ====== IVS PATH =========
  useEffect(() => {
    if (!useIVS) return;
    let id;
    id = setInterval(async () => {
      try {
        const api = ivsRef.current;
        if (api?.getLiveLatency) {
          const sec = await api.getLiveLatency();
          if (Number.isFinite(sec)) setBehindLiveMs(Math.max(0, sec * 1000));
        }
      } catch { }
    }, 500);
    return () => clearInterval(id);
  }, [useIVS]);

  const ivsGoLive = useCallback(async () => {
    try {
      const api = ivsRef.current;
      // Prefer native live-edge jump if available
      if (api?.seekToLive) await api.seekToLive();
      if (api?.setLiveLowLatency) await api.setLiveLowLatency(true);
      if (api?.play) await api.play();
    } catch (e) {
      console.warn(`[${TAG}] ivsGoLive error`, e?.message || e);
    }
  }, []);

  // Handle IVS ready/buffering states
  const onIVSStateChange = useCallback((e) => {
    const state = e?.nativeEvent?.state;
    // States: IDLE, BUFFERING, READY, PLAYING, ENDED, etc. (depends on wrapper)
    setIsReady(state === 'READY' || state === 'PLAYING');
  }, []);

  // === expo-video PATH =====
  const seekToLiveEdge = useCallback(
    async (padSec = 1.2, reason = 'manual') => {
      try {
        if (!player) return;
        const durSec = Number.isFinite(player.duration)
          ? player.duration
          : latestPlayableSecRef.current || 0;
        const posSec = Number.isFinite(player.currentTime) ? player.currentTime : 0;
        const playableSec = Math.max(durSec, latestPlayableSecRef.current || 0);

        const isProbablyLive = playableSec > 0 && (playableSec - posSec) > 2;
        if (!isProbablyLive) {
          console.log(`[${TAG}] seekToLiveEdge: not clearly live; reason=${reason}`);
          return;
        }

        const edgeSec = Math.max(0, playableSec - padSec);
        console.log(
          `[${TAG}] seekToLiveEdge:`,
          JSON.stringify({ reason, playableSec, edgeSec, padSec, isPlaying: !!player.playing })
        );

        if (!player.playing) {
          await player.play();
        }
        player.currentTime = edgeSec;
      } catch (err) {
        console.warn(`[${TAG}] seekToLiveEdge error: ${String(err?.message || err)}`);
      }
    },
    [player]
  );

  // Player lifecycle + status polling for expo-video
  useEffect(() => {
    if (useIVS) return; // handled by IVS path
    if (!player) return;

    let poll;
    let mounted = true;

    const onReady = () => {
      if (!mounted) return;
      setIsReady(true);
      const stickyMs = 2000;
      stickyLiveUntilRef.current = Date.now() + stickyMs;
      log(`Sticky live ON for ${stickyMs} ms (until ${new Date(stickyLiveUntilRef.current).toISOString()})`);
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
            log(`auto-correcting to live (one-time), diff= ${diffSec}`);
            seekToLiveEdge(1.2, 'status:auto-correct');
          }

          if (Date.now() < stickyLiveUntilRef.current && diffSec > 1.8) {
            seekToLiveEdge(1.0, 'status:sticky-live');
          }
        }
      } catch { }
    }, 500);

    return () => {
      mounted = false;
      if (poll) clearInterval(poll);
    };
  }, [useIVS, player, isReady, log, seekToLiveEdge]);

  // iOS-only hint for expo-video
  useEffect(() => {
    if (useIVS) return;
    if (!player) return;
    if (Platform.OS === 'ios') {
      player.targetOffsetFromLive = 1.5;
    }
  }, [useIVS, player]);

  // Refresh key to nudge re-mount when uri changes
  const cacheBustingUri = useMemo(() => (uri ? `${uri}?ts=${Date.now()}` : null), [uri]);

  // Unified "Go Live" click
  const onGoLivePress = useCallback(() => {
    if (useIVS) ivsGoLive();
    else seekToLiveEdge(1.0, 'tap:go-live');
  }, [useIVS, ivsGoLive, seekToLiveEdge]);

  // Unified error handler
  const handleError = useCallback((msg) => setError(msg || 'Playback error'), []);

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
          {hasSource && useIVS && (
            <IVSPlayer
              ref={ivsRef}
              style={S.video}
              streamUrl={uri}
              autoplay={true}
              liveLowLatency={true}
              /* Useful events */
              onPlayerStateChange={onIVSStateChange}
              onError={(e) => {
                const msg = e?.nativeEvent?.error || e?.message || 'Playback error';
                handleError(msg);
              }}
            />
          )}
          {hasSource && !useIVS && (
            <VideoView
              key={cacheBustingUri}
              style={S.video}
              player={player}
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              contentFit="contain"
              nativeControls={false}
              onReadyForDisplay={() => {
                setIsReady(true);
                const dur = Number.isFinite(player?.duration) ? Math.floor(player.duration * 1000) : undefined;
                const playable = Number.isFinite(player?.duration) ? Math.floor(player.duration * 1000) : undefined;
                const heuristicLive = playable > 0 && playable < 10 * 60 * 1000;
                console.log(`[${TAG}] onLoad:`, JSON.stringify({ duration: dur, playable, heuristicLive }));
              }}
              onError={(e) => {
                const msg =
                  e?.nativeEvent?.error ??
                  e?.nativeEvent?.message ??
                  e?.message ??
                  'Playback error';
                handleError(msg);
              }}
            />
          )}
          {behindLiveMs > 3000 && (
            <TouchableOpacity onPress={onGoLivePress} style={S.goLive}>
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
                    if (useIVS) {
                      // try play + seek live
                      await ivsGoLive();
                    } else {
                      await player?.play?.();
                    }
                    setError(null);
                  } catch { }
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
      {/* Chat overlay (conditional) */}
      {showChat && (
        <LiveChatOverlay liveId={liveId} />
      )}
      <TouchableOpacity
        onPress={() => setShowChat(v => !v)}
        activeOpacity={0.8}
        style={S.chatToggle}
        accessibilityRole="button"
        accessibilityLabel={showChat ? 'Hide chat' : 'Show chat'}
      >
        <MaterialCommunityIcons
          name={showChat ? 'chat' : 'chat-remove'}
          size={26}
          color="#fff"
        />
      </TouchableOpacity>
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
  chatToggle: {
    position: 'absolute',
    right: 10,
    top: '65%',
    transform: [{ translateY: -20 }],
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 22,
    padding: 8,
    zIndex: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
