import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { ApiVideoLiveStreamView } from '@api.video/react-native-livestream';
import { useDispatch, useSelector } from 'react-redux';
import { selectCurrentLive, clearCurrentLive } from '../../../Slices/LiveStreamSlice';
import LiveChatOverlay from '../LivePlayer/LiveChat/LiveChatOverlay';
import { fetchRecentChat, setJoined as setChatJoined } from '../../../Slices/LiveChatSlice';
import LiveBottomBar from '../Buttons/LiveBottomBar';
import SideControls from '../Buttons/SideControls';
import { usePublisher } from '../UsePublisher/usePublisher';
import { useLiveChatSession } from '../useLiveChatSession';
import { getLiveViewers } from '../../../app/socket/liveChatSocketClient';
import ViewersModal from '../LivePlayer/ViewersModal/ViewersModal';
import LiveTopBar from '../Buttons/LiveTopBar';
import { selectUser } from '../../../Slices/UserSlice';

const BASE_URL = `${process.env.EXPO_PUBLIC_BASE_URL}`;

export default function GoLive({ navigation }) {
  const dispatch = useDispatch();
  const live = useSelector(selectCurrentLive);
  const liveRef = useRef(null);
  const user = useSelector(selectUser);
  const [viewerModalVisible, setViewerModalVisible] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState(null);
  const [viewerList, setViewerList] = useState([]);
  const hostId = user?.id || user?._id;

  // Clear any stale live on mount
  useEffect(() => {
    if (live?.liveId) {
      try { dispatch(clearCurrentLive()); } catch { }
    }
  }, []); // eslint-disable-line

  const { ui, setUI, actions } = usePublisher({ liveRef, navigation, liveFromStore: live });
  const isLiveish = ui.status === 'live' || ui.status === 'reconnecting';

  // Hook the chat/socket using centralized base URL
  useLiveChatSession(ui.chatLiveId, { baseUrl: BASE_URL, backfillOnce: true });

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
          <LiveTopBar
            isLiveish={isLiveish}
            elapsed={ui.elapsed}
            status={ui.status}
            viewerCount={viewerCount}
            onClosePress={actions.onClosePress}
            onBadgePress={openViewerModal}
            isHost={true}
          />
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
        hostId={hostId}
      />
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  preview: { flex: 1, ...StyleSheet.absoluteFillObject },
  previewHidden: { opacity: 0.001 },
  blackout: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
});
