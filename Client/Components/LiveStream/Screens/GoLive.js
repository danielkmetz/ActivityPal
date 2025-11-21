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

/* ------------------------- Debug helpers ------------------------- */

const TAG = '[GoLive]';
const DEBUG = true;

const log = (...a) => { if (DEBUG) console.log(TAG, ...a); };
const warn = (...a) => { if (DEBUG) console.warn(TAG, ...a); };
const err = (...a) => { if (DEBUG) console.error(TAG, ...a); };

export default function GoLive({ navigation }) {
  log('↩️ component render start');
  const dispatch = useDispatch();
  const live = useSelector(selectCurrentLive);
  const user = useSelector(selectUser);
  const liveRef = useRef(null);
  const closingRef = useRef(false);
  const [viewerModalVisible, setViewerModalVisible] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState(null);
  const [viewerList, setViewerList] = useState([]);
  const [showLiveView, setShowLiveView] = useState(false);

  const hostId = user?.id || user?._id;

  log('state snapshot', {
    userId: hostId,
    liveFromStore: live,
  });

  useEffect(() => {
    log('⏳ scheduling delayed mount of ApiVideoLiveStreamView');
    const timeout = setTimeout(() => {
      log('⏳ enabling ApiVideoLiveStreamView after delay');
      setShowLiveView(true);
    }, 1500); // delay api live stream mount

    return () => {
      log('⏳ clearing delayed mount timeout');
      clearTimeout(timeout);
    };
  }, []);

  // Clear any stale live on mount
  // useEffect(() => {
  //   log('🟢 mount effect: checking for stale live', { live });
  //   if (live?.liveId) {
  //     log('→ clearing stale live from store', { liveId: live.liveId });
  //     try {
  //       dispatch(clearCurrentLive());
  //     } catch (e) {
  //       err('✖ error clearing live on mount', e);
  //     }
  //   }
  //   return () => {
  //     log('🔴 unmount GoLive screen');
  //   };
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  // Log before / after usePublisher to see if crash is inside hook
  log('before usePublisher call');
  const { ui, setUI, actions } = usePublisher({
    liveRef,
    navigation,
    liveFromStore: live,
  });
  log('after usePublisher call', { ui, actionsKeys: Object.keys(actions || {}) });

  const isLiveish = ui.status === 'live' || ui.status === 'reconnecting';
  log('derived isLiveish', { status: ui.status, isLiveish });

  // Log whenever ui changes meaningfully
  useEffect(() => {
    log('🧩 ui changed', ui);
  }, [ui]);

  // Hook the chat/socket using centralized base URL
  log('before useLiveChatSession', { chatLiveId: ui.chatLiveId });
  useLiveChatSession(ui.chatLiveId, { backfillOnce: true });
  log('after useLiveChatSession');

  // Viewer count from store (only when live-ish and we have a room id)
  const rawViewerCount = useSelector((s) => {
    if (!isLiveish || !ui.chatLiveId) return 0;
    const val = s.live?.viewerCounts?.[ui.chatLiveId] ?? 0;
    if (DEBUG) {
      console.log(TAG, '[viewer selector]', {
        chatLiveId: ui.chatLiveId,
        fromStore: s.live?.viewerCounts,
        resolved: val,
      });
    }
    return val;
  });

  const viewerCount = Math.max(0, rawViewerCount - (hostId ? 1 : 0));

  useEffect(() => {
    log('👀 viewer counts changed', {
      rawViewerCount,
      viewerCount,
      chatLiveId: ui.chatLiveId,
      isLiveish,
    });
  }, [rawViewerCount, viewerCount, ui.chatLiveId, isLiveish]);

  // Chat join/backfill
  useEffect(() => {
    log('💬 chat join effect fired', {
      chatLiveId: ui.chatLiveId,
      status: ui.status,
      isLiveish,
    });

    if (!ui.chatLiveId) {
      log('chatLiveId missing, skipping join/backfill');
      return;
    }

    const joined = ui.status === 'live' || ui.status === 'reconnecting';
    log('→ setChatJoined', { liveStreamId: ui.chatLiveId, joined });

    dispatch(setChatJoined({ liveStreamId: ui.chatLiveId, joined }));
    if (joined) {
      log('→ fetchRecentChat', { liveStreamId: ui.chatLiveId });
      dispatch(fetchRecentChat({ liveStreamId: ui.chatLiveId, limit: 50 }));
    }

    return () => {
      log('↩️ cleanup chat join effect', { chatLiveId: ui.chatLiveId });
      dispatch(setChatJoined({ liveStreamId: ui.chatLiveId, joined: false }));
    };
  }, [dispatch, ui.chatLiveId, ui.status, isLiveish]);

  const openViewerModal = useCallback(async () => {
    log('👥 openViewerModal called', {
      isLiveish,
      chatLiveId: ui.chatLiveId,
    });

    if (!isLiveish || !ui.chatLiveId) {
      warn('openViewerModal blocked: not live or missing chatLiveId');
      return;
    }

    setViewerModalVisible(true);
    setViewerLoading(true);
    setViewerError(null);

    try {
      log('→ calling getLiveViewers', { chatLiveId: ui.chatLiveId });
      const ack = await getLiveViewers(ui.chatLiveId);
      log('← getLiveViewers ack', ack);

      if (ack?.ok) {
        setViewerList(ack.viewers || []);
      } else {
        const message = ack?.error || 'Failed to load viewers';
        warn('viewer ack not ok', { message });
        setViewerError(message);
        setViewerList([]);
      }
    } catch (e) {
      err('✖ getLiveViewers threw error', e);
      setViewerError(e?.message || String(e));
      setViewerList([]);
    } finally {
      setViewerLoading(false);
    }
  }, [isLiveish, ui.chatLiveId]);

  return (
    <View style={S.container}>
      <TouchableWithoutFeedback
        onPress={() => {
          log('background press → dismiss keyboard');
          Keyboard.dismiss();
        }}
        accessible={false}
      >
        <View style={{ flex: 1 }}>
          {ui.showCam && showLiveView && (
            <View style={S.previewContainer}>
              {log('rendering ApiVideoLiveStreamView', {
                camera: ui.front ? 'front' : 'back',
                isEnding: ui.isEnding,
              })}
              <ApiVideoLiveStreamView
                ref={liveRef}
                style={[
                  S.previewView,
                  ui.isEnding && S.previewHidden,
                ]}
                camera={ui.front ? 'front' : 'back'}
                enablePinchedZoom
                video={{
                  fps: 30,
                  resolution: '720p',
                  bitrate: 1.5 * 1024 * 1024,
                  gopDuration: 2,
                }}
                audio={{
                  bitrate: 128000,
                  sampleRate: 44100,
                  isStereo: true,
                }}
                isMuted={false}
                onConnectionSuccess={(info) => {
                  console.log('[ApiVideoLiveStreamView] onConnectionSuccess', info);
                  try {
                    actions.onConnectionSuccess(info);
                  } catch (e) {
                    console.warn('[GoLive] onConnectionSuccess handler threw', e);
                  }
                }}
                onConnectionFailed={(errInfo) => {
                  console.log('[ApiVideoLiveStreamView] onConnectionFailed', errInfo);
                  try {
                    actions.onConnectionFailed(errInfo);
                  } catch (e) {
                    console.warn('[GoLive] onConnectionFailed handler threw', e);
                  }
                }}
                onDisconnect={(info) => {
                  console.log('[ApiVideoLiveStreamView] onDisconnect', info);
                  try {
                    actions.onDisconnect(info);
                  } catch (e) {
                    console.warn('[GoLive] onDisconnect handler threw', e);
                  }
                }}
                onError={(e) => {
                  // nativeEvent is usually where error info lives
                  console.log(
                    '[ApiVideoLiveStreamView] onError raw',
                    e,
                    'nativeEvent:',
                    e?.nativeEvent
                  );
                }}
              />
              {ui.isEnding && <View pointerEvents="none" style={S.blackout} />}
            </View>
          )}

          <LiveTopBar
            isLiveish={isLiveish}
            elapsed={ui.elapsed}
            status={ui.status}
            viewerCount={viewerCount}
            onClosePress={() => {
              log('⏹ onClosePress from LiveTopBar');
              if (closingRef.current) {
                log('⏹ onClosePress ignored: already closing');
                return;
              }
              closingRef.current = true; // ⭐ NEW: only allow one close sequence
              actions.onClosePress();
            }}
            onBadgePress={openViewerModal}
            isHost={true}
          />

          <LiveBottomBar
            isEnding={ui.isEnding}
            countdown={ui.countdown}
            onCancelCountdown={() => {
              log('🛑 cancel countdown pressed', {
                countdown: ui.countdown,
                status: ui.status,
              });
              setUI({
                type: 'SET',
                patch: { countdown: 0, arming: false, status: 'idle' },
              });
            }}
            isLive={isLiveish || ui.status === 'connecting'}
            onArm={() => {
              log('🟡 armAndCountdown pressed');
              actions.armAndCountdown();
            }}
          />
        </View>
      </TouchableWithoutFeedback>
      {ui.chatLiveId && !ui.isEnding && ui.showChat && (
        <>
          {log('render LiveChatOverlay', { chatLiveId: ui.chatLiveId })}
          <LiveChatOverlay liveId={ui.chatLiveId} isHost />
        </>
      )}
      <SideControls
        onFlip={() => {
          log('🔁 flip camera pressed', { currentFront: ui.front });
          setUI({ type: 'SET', patch: { front: !ui.front } });
        }}
        onToggleChat={() => {
          log('💬 toggle chat pressed', { current: ui.showChat });
          setUI({ type: 'SET', patch: { showChat: !ui.showChat } });
        }}
        showChat={ui.showChat}
        isEnding={ui.isEnding}
        topPercent={60}
        host={true}
      />

      {/* <ViewersModal
        visible={viewerModalVisible}
        loading={viewerLoading}
        error={viewerError}
        viewers={viewerList}
        onClose={() => {
          log('👥 ViewersModal closed');
          setViewerModalVisible(false);
        }}
        onRefresh={openViewerModal}
        hostId={hostId}
      /> */}
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Absolute container that fills the screen
  previewContainer: {
    ...StyleSheet.absoluteFillObject,
  },

  // Actual camera view: NO absoluteFill, just a normal flex view
  previewView: {
    flex: 1,
    backgroundColor: '#000',
    alignSelf: 'stretch',
  },

  previewHidden: {
    opacity: 0.001,
  },

  blackout: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
});
