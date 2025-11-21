import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, ActivityIndicator, TouchableOpacity, Text, Keyboard,
  TouchableWithoutFeedback, Alert
} from 'react-native';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { useRoute, useNavigation } from '@react-navigation/native';
import { VideoView, useVideoPlayer } from 'expo-video';
import IVSPlayer from 'amazon-ivs-react-native-player';
import { selectLiveById } from '../../../Slices/LiveStreamSlice';
import LiveChatOverlay from './LiveChat/LiveChatOverlay';
import { useLiveChatSession } from '../useLiveChatSession';
import ViewersModal from './ViewersModal/ViewersModal';
import { getLiveViewers } from '../../../app/socket/liveChatSocketClient';
import SideControls from '../Buttons/SideControls';
import PlayerErrorOverlay from './PlayerErrorOverlay';
import LiveTopBar from '../Buttons/LiveTopBar';
import { getAuthHeaders } from '../../../utils/Authorization/getAuthHeaders';
import useIvsPlayback from './LivePlayerHooks/useIVSPlayback'
import useExpoLivePlayback from './LivePlayerHooks/useExpoLivePlayback';

const API = `${process.env.EXPO_PUBLIC_SERVER_URL}/live`;
const TAG = 'LivePlayer';

const isIVSUrl = (url) => typeof url === 'string' && /(live-video\.net|ivs\.)/i.test(url);

export default function LivePlayerScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { liveId } = route.params || {};
  const live = useSelector((state) => selectLiveById(state, liveId));
  const rawViewerCount = useSelector((s) => s.live?.viewerCounts?.[liveId] ?? 0);
  const [uri, setUri] = useState(live?.playbackUrl || null);
  const [error, setError] = useState(null);
  const [showChat, setShowChat] = useState(true);
  const [viewerModalVisible, setViewerModalVisible] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState(null);
  const [viewerList, setViewerList] = useState([]);
  const ivsRef = useRef(null);
  const useIVS = isIVSUrl(uri);
  const hostId = live?.hostUserId;
  const hasSeenLiveRef = useRef(false);
  const closedRef = useRef(false);

  const handleEndedOnce = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    Alert.alert(
      'The live stream has ended',
      '',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
      { cancelable: false }
    );
  }, [navigation]);

  const adjustedViewerCount = useMemo(
    () => Math.max(0, rawViewerCount - (hostId ? 1 : 0)),
    [rawViewerCount, hostId]
  );

  useEffect(() => {
    if (live?.isActive) {
      hasSeenLiveRef.current = true;
    }
  }, [live?.isActive, liveId]);

  useEffect(() => {
    if (!hasSeenLiveRef.current) return;

    const ended =
      !live ||
      live?.isActive === false ||   // only runs after we've seen isActive === true
      live?.status === 'ended';

    if (ended) handleEndedOnce();
  }, [live, live?.isActive, live?.status, handleEndedOnce]);

  useLiveChatSession(liveId, {
    onEnded: handleEndedOnce,
  });

  // expo-video player (when NOT IVS)
  const player = useVideoPlayer(
    useIVS ? null : (uri || null),
    useCallback((p) => {
      if (!p) return;
      try { p.loop = false; p.muted = false; p.play(); } catch { }
    }, [useIVS, uri])
  );

  const log = useCallback((msg, extra) => {
    if (extra !== undefined) console.log(`[${TAG}] ${msg}:`, extra);
    else console.log(`[${TAG}] ${msg}`);
  }, []);

  // Get readiness and behindLiveMs per path:
  const { isReady: ivsReady, behindLiveMs: ivsBehind, onIVSStateChange, goLive } =
    useIvsPlayback({
      ivsRef,
      onEnded: handleEndedOnce
    });

  const { isReady: expoReady, behindLiveMs: expoBehind, onGoLivePress: onExpoGoLive } =
    useExpoLivePlayback({ player, log });

  const hasSource = !!uri;
  const isReady = useIVS ? ivsReady : expoReady;
  const behindLiveMs = useIVS ? ivsBehind : expoBehind;

  const status = error
    ? 'error'
    : (!hasSource || !isReady ? 'connecting' : 'live');
  const isLiveish = status === 'live';

  // pick correct "go live" press
  const onGoLivePress = useCallback(() => {
    if (useIVS) goLive(); else onExpoGoLive();
  }, [useIVS, goLive, onExpoGoLive]);

  // keep uri synced with store / fallback
  useEffect(() => {
    if (live?.playbackUrl) setUri(live.playbackUrl);
  }, [live?.playbackUrl]);

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
        if (data?.playbackUrl) setUri(data.playbackUrl);
      } catch (e) {
        setError(e?.response?.data?.message || 'Could not load playback URL');
      }
    })();
  }, [liveId, uri]);

  const openViewerModal = useCallback(async () => {
    if (!isLiveish || !liveId) return;
    setViewerModalVisible(true);
    setViewerLoading(true);
    setViewerError(null);
    try {
      const ack = await getLiveViewers(liveId);
      if (ack?.ok) setViewerList(ack.viewers || []);
      else {
        setViewerError(ack?.error || 'Failed to load viewers');
        setViewerList([]);
      }
    } catch (e) {
      setViewerError(String(e?.message || e) || 'Failed to load viewers');
      setViewerList([]);
    } finally {
      setViewerLoading(false);
    }
  }, [isLiveish, liveId]);

  const handleError = useCallback((msg) => setError(msg || 'Playback error'), []);
  const handleRetryPress = useCallback(async () => {
    try {
      if (useIVS) await goLive();
      else await player?.play?.();
      setError(null);
    } catch { }
  }, [useIVS, goLive, player]);

  const handleGoBack = () => navigation.goBack();

  return (
    <View style={S.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          {hasSource && useIVS && (
            <IVSPlayer
              ref={ivsRef}
              style={S.video}
              streamUrl={uri}
              autoplay
              liveLowLatency
              onPlayerStateChange={onIVSStateChange}
              onError={(e) => handleError(e?.nativeEvent?.error || e?.message || 'Playback error')}
            />
          )}
          {hasSource && !useIVS && (
            <VideoView
              key={uri}
              style={S.video}
              player={player}
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              nativeControls={false}
              onReadyForDisplay={() => { }}
              onError={(e) => {
                const msg = e?.nativeEvent?.error ?? e?.nativeEvent?.message ?? e?.message ?? 'Playback error';
                handleError(msg);
              }}
            />
          )}
          {behindLiveMs > 3000 && (
            <TouchableOpacity onPress={onGoLivePress} style={S.goLive}>
              <Text style={S.goLiveText}>GO LIVE</Text>
            </TouchableOpacity>
          )}
          {!hasSource && (
            <View style={S.loadingOverlay}>
              <ActivityIndicator />
              <Text style={S.subtle}>Connecting to live…</Text>
            </View>
          )}
          {!!error && (
            <PlayerErrorOverlay
              message="Couldn’t play the stream."
              details={String(error)}
              onRetry={handleRetryPress}
            />
          )}
          <LiveTopBar
            isHost={false}
            isLiveish={status === 'live'}
            status={status}
            viewerCount={adjustedViewerCount}
            onClosePress={handleGoBack}
            onBadgePress={openViewerModal}
            live={live}
            style={{ top: 66, left: 12, right: 12 }}
          />
        </View>
      </TouchableWithoutFeedback>
      {showChat && (<LiveChatOverlay liveId={liveId} />)}
      <SideControls
        onFlip={() => { }}
        onToggleChat={() => setShowChat(!showChat)}
        showChat={showChat}
        topPercent={60}
        host={false}
      />
      <ViewersModal
        visible={viewerModalVisible}
        loading={viewerLoading}
        error={viewerError}
        viewers={viewerList}
        onClose={() => setViewerModalVisible(false)}
        onRefresh={openViewerModal}
        hostId={hostId}
      />
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  video: { ...StyleSheet.absoluteFillObject },
  loadingOverlay: { position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center' },
  subtle: { color: '#aaa', marginTop: 6, textAlign: 'center' },
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
