import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { ApiVideoLiveStreamView } from '@api.video/react-native-livestream';
import { useDispatch, useSelector } from 'react-redux';
import { selectCurrentLive, clearCurrentLive } from '../../../Slices/LiveStreamSlice';
import LiveChatOverlay from '../LivePlayer/LiveChat/LiveChatOverlay';
import { fetchRecentChat, setJoined as setChatJoined } from '../../../Slices/LiveChatSlice';
import LiveBottomBar from '../Buttons/LiveBottomBar';
import SideControls from '../Buttons/SideControls';
import { usePublisher } from '../UsePublisher/usePublisher';
import { useLiveChatSession } from '../useLiveChatSession';
import { Entypo } from '@expo/vector-icons';
import { getLiveViewers } from '../../../app/socket/liveChatSocketClient';
import ViewersModal from '../LivePlayer/ViewersModal/ViewersModal';

function formatTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

const BASE_API = `${process.env.EXPO_PUBLIC_BASE_URL}`;

export default function GoLive({ navigation }) {
  const dispatch = useDispatch();
  const live = useSelector(selectCurrentLive);
  const liveRef = useRef(null);

  const [viewerModalVisible, setViewerModalVisible] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState(null);
  const [viewerList, setViewerList] = useState([]);

  // Clear any stale live on mount
  useEffect(() => {
    if (live?.liveId) {
      try { dispatch(clearCurrentLive()); } catch {}
    }
  }, []); // eslint-disable-line

  const { ui, setUI, actions } = usePublisher({ liveRef, navigation, liveFromStore: live });
  const isLiveish = ui.status === 'live' || ui.status === 'reconnecting';

  // Hook the chat/socket using centralized base URL
  useLiveChatSession(ui.chatLiveId, { baseUrl: 'http://192.168.4.63:5000', backfillOnce: true });

  // Viewer count from store (only when live-ish and we have a room id)
  const viewerCount = useSelector((s) => {
    if (!isLiveish || !ui.chatLiveId) return 0;
    return s.live?.viewerCounts?.[ui.chatLiveId] ?? 0;
  });

  // Chat join/backfill
  useEffect(() => {
    if (!ui.chatLiveId) return;
    const joined = ui.status === 'live' || ui.status === 'reconnecting';
    dispatch(setChatJoined({ liveStreamId: ui.chatLiveId, joined }));
    if (joined) dispatch(fetchRecentChat({ liveStreamId: ui.chatLiveId, limit: 50 }));
    return () => { dispatch(setChatJoined({ liveStreamId: ui.chatLiveId, joined: false })); };
  }, [dispatch, ui.chatLiveId, ui.status]);

  const openViewerModal = useCallback(async () => {
    if (!isLiveish || !ui.chatLiveId) return;
    setViewerModalVisible(true);
    setViewerLoading(true);
    setViewerError(null);
    const ack = await getLiveViewers(ui.chatLiveId);
    if (ack?.ok) {
      setViewerList(ack.viewers || []);
    } else {
      setViewerError(ack?.error || 'Failed to load viewers');
      setViewerList([]);
    }
    setViewerLoading(false);
  }, [isLiveish, ui.chatLiveId]);

  const showEndButton = isLiveish;

  const statusBadge = (
    ui.status === 'connecting' ? (
      <Text style={S.badge}>Connecting…</Text>
    ) : ui.status === 'reconnecting' ? (
      <Text style={S.badge}>Reconnecting…</Text>
    ) : isLiveish ? (
      <Pressable
        onPress={openViewerModal}
        style={[S.badge, S.badgeLive, S.badgeRow]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Viewers: ${viewerCount}`}
      >
        <Text style={S.badgeLiveTxt}>LIVE</Text>
        <Text style={S.badgeLiveTxt}>·</Text>
        <Entypo name="eye" size={14} color="#7f1d1d" />
        <Text style={S.badgeLiveTxt}>{viewerCount}</Text>
      </Pressable>
    ) : ui.status === 'error' ? (
      <Text style={[S.badge, S.badgeError]}>Error</Text>
    ) : null
  );

  return (
    <View style={S.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          {ui.showCam && (
            <View style={S.preview}>
              <ApiVideoLiveStreamView
                ref={liveRef}
                style={[S.preview, ui.isEnding && S.previewHidden]}
                camera={ui.front ? 'front' : 'back'}
                enablePinchedZoom
                video={{ fps: 30, resolution: '720p', bitrate: 1.5 * 1024 * 1024, gopDuration: 2 }}
                audio={{ bitrate: 128000, sampleRate: 44100, isStereo: true }}
                isMuted={false}
                onConnectionSuccess={actions.onConnectionSuccess}
                onConnectionFailed={actions.onConnectionFailed}
                onDisconnect={actions.onDisconnect}
              />
              {ui.isEnding && <View pointerEvents="none" style={S.blackout} />}
            </View>
          )}
          <View style={S.topBar}>
            <View style={S.topLeftRow}>
              <Pressable
                onPress={actions.onClosePress}
                style={[S.pill, isLiveish && S.pillEnd]}
                accessibilityRole="button"
                accessibilityLabel={showEndButton ? 'End live stream' : 'Close'}
              >
                <Text style={S.pillTxt}>{showEndButton ? 'End' : 'Close'}</Text>
              </Pressable>

              {isLiveish && (
                <Text style={S.timer}>{formatTime(ui.elapsed)}</Text>
              )}
            </View>
            {statusBadge}
          </View>
          <LiveBottomBar
            isEnding={ui.isEnding}
            countdown={ui.countdown}
            onCancelCountdown={() => setUI({ type: 'SET', patch: { countdown: 0, arming: false, status: 'idle' } })}
            isLive={isLiveish || ui.status === 'connecting'}
            onArm={actions.armAndCountdown}
          />
        </View>
      </TouchableWithoutFeedback>

      {ui.chatLiveId && !ui.isEnding && ui.showChat && <LiveChatOverlay liveId={ui.chatLiveId} isHost />}

      <SideControls
        onFlip={() => setUI({ type: 'SET', patch: { front: !ui.front } })}
        onToggleChat={() => setUI({ type: 'SET', patch: { showChat: !ui.showChat } })}
        showChat={ui.showChat}
        isEnding={ui.isEnding}
        topPercent={60}
        host={true}
      />

      <ViewersModal
        visible={viewerModalVisible}
        loading={viewerLoading}
        error={viewerError}
        viewers={viewerList}
        onClose={() => setViewerModalVisible(false)}
        onRefresh={openViewerModal}
      />
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  preview: { flex: 1, ...StyleSheet.absoluteFillObject },
  topBar: {
    position: 'absolute', top: 60, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  pill: { backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18 },
  pillEnd: {
    backgroundColor: '#ef4444',   // red when live/reconnecting
  },
  pillTxt: { color: '#fff', fontWeight: '700' },
  badge: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    color: '#991b1b',
    fontWeight: '800',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeLive: {
    backgroundColor: '#fecaca', // red-200
  },
  badgeError: {
    backgroundColor: '#fecaca',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeLiveTxt: {
    color: '#7f1d1d',  // red-900 to match the pill
    fontWeight: '800',
  },
  previewHidden: { opacity: 0.001 },
  blackout: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  bottomRight: {
    position: 'absolute',
    bottom: 40,
    right: 16,
    alignItems: 'flex-end',
    gap: 10,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timer: { color: '#fff', fontWeight: '800' },
  btn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  end: { backgroundColor: '#ef4444' },
  retry: { backgroundColor: '#0ea5e9' },
  btnTxt: { color: '#fff', fontWeight: '700' },
  connectingWrap: { alignItems: 'flex-end' },
  connectingTxt: { color: '#fff', marginTop: 6, fontWeight: '600' },
});
