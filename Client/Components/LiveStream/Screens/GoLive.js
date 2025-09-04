import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Keyboard, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { ApiVideoLiveStreamView } from '@api.video/react-native-livestream';
import { useDispatch, useSelector } from 'react-redux';
import { selectCurrentLive, clearCurrentLive } from '../../../Slices/LiveStreamSlice';
import LiveChatOverlay from '../LivePlayer/LiveChat/LiveChatOverlay';
import { fetchRecentChat, setJoined as setChatJoined } from '../../../Slices/LiveChatSlice';
import LiveBottomBar from '../Buttons/LiveBottomBar';
import SideControls from '../Buttons/SideControls';
import { usePublisher } from '../UsePublisher/usePublisher';
import { useLiveChatSession } from '../useLiveChatSession';

function formatTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export default function GoLive({ navigation }) {
  const dispatch = useDispatch();
  const live = useSelector(selectCurrentLive);
  const liveRef = useRef(null);

  // inside GoLive()
  const viewerCount = useSelector(
    (s) => s.live?.viewerCounts?.[ui.chatLiveId] ?? 0
  );

  // Clear any stale live on mount
  useEffect(() => { if (live?.liveId) { try { dispatch(clearCurrentLive()); } catch { } } }, []); // eslint-disable-line

  const { ui, setUI, actions } = usePublisher({ liveRef, navigation, liveFromStore: live });

  useLiveChatSession(ui.chatLiveId, { baseUrl: 'http://10.0.0.24:5000', backfillOnce: true });

  // Chat join/backfill
  useEffect(() => {
    if (!ui.chatLiveId) return;
    const joined = ui.status === 'live' || ui.status === 'reconnecting';
    dispatch(setChatJoined({ liveStreamId: ui.chatLiveId, joined }));
    if (joined) dispatch(fetchRecentChat({ liveStreamId: ui.chatLiveId, limit: 50 }));
    return () => { dispatch(setChatJoined({ liveStreamId: ui.chatLiveId, joined: false })); };
  }, [dispatch, ui.chatLiveId, ui.status]);

  const showEndButton = ui.status === 'live' || ui.status === 'reconnecting';
  const statusBadge = (
    ui.status === 'connecting' ? <Text style={S.badge}>Connecting…</Text> :
      ui.status === 'reconnecting' ? <Text style={S.badge}>Reconnecting…</Text> :
        ui.status === 'live' ? <Text style={[S.badge, S.badgeLive]}>LIVE</Text> :
          ui.status === 'error' ? <Text style={[S.badge, S.badgeError]}>Error</Text> :
            null
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
                style={[S.pill, (ui.status === 'live' || ui.status === 'reconnecting') && S.pillEnd]}
                accessibilityRole="button"
                accessibilityLabel={showEndButton ? 'End live stream' : 'Close'}
              >
                <Text style={S.pillTxt}>{showEndButton ? 'End' : 'Close'}</Text>
              </Pressable>

              {(ui.status === 'live' || ui.status === 'reconnecting') && (
                <Text style={S.timer}>{formatTime(ui.elapsed)}</Text>
              )}
            </View>
            <View style={S.rightGroup}>
              <View style={S.viewerPill}>
                <Text style={S.viewerTxt}>{viewerCount}</Text>
              </View>
              {statusBadge}
            </View>
          </View>
          <LiveBottomBar
            isEnding={ui.isEnding}
            countdown={ui.countdown}
            onCancelCountdown={() => setUI({ type: 'SET', patch: { countdown: 0, arming: false, status: 'idle' } })}
            isLive={ui.status === 'live' || ui.status === 'reconnecting' || ui.status === 'connecting'}
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
    // light red pill
    backgroundColor: 'rgba(239, 68, 68, 0.18)', // ~ red-500 @ 18% alpha
    color: '#991b1b',                            // dark red text
    fontWeight: '800',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeLive: {
    backgroundColor: '#fecaca', // red-200
    color: '#7f1d1d',           // red-900
  },
  badgeError: {
    backgroundColor: '#fecaca',
    color: '#7f1d1d',
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
    gap: 10,                // RN 0.71+; if older, replace with marginLeft on timer
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
  rightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewerPill: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  viewerTxt: { color: '#fff', fontWeight: '700' },
});
