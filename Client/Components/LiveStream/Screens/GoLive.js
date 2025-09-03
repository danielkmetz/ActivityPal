import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, BackHandler, AppState, ActivityIndicator, InteractionManager, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { ApiVideoLiveStreamView } from '@api.video/react-native-livestream';
import { useDispatch, useSelector } from 'react-redux';
import {
  startLiveSession,
  stopLiveSession,
  selectCurrentLive,
  clearCurrentLive,
} from '../../../Slices/LiveStreamSlice';
import inCallManager from 'react-native-incall-manager';
import LiveChatOverlay from '../LivePlayer/LiveChat/LiveChatOverlay';
import { fetchRecentChat, setJoined as setChatJoined } from '../../../Slices/LiveChatSlice';
import { useFocusEffect } from '@react-navigation/native';
import { deactivateExpoAudio, tick, resetTick } from '../../../utils/LiveStream/deactivateAudio';
import { useLiveChatSession } from '../useLiveChatSession';

const settleFrames = async (ms = 120) => {
  await new Promise(r => requestAnimationFrame(r));
  await InteractionManager.runAfterInteractions(() => Promise.resolve());
  await new Promise(r => setTimeout(r, ms));
};

const stopPublisherSafe = async (liveRef, L) => {
  if (!liveRef.current?.stopStreaming) return;
  let done = false;
  const timeout = new Promise(r => setTimeout(() => { if (!done) r('timeout'); }, 1500));
  const stop = (async () => {
    try {
      await liveRef.current.stopStreaming();
      done = true;
      return 'ok';
    } catch (e) {
      done = true;
      return 'err';
    }
  })();
  await Promise.race([stop, timeout]);
};

const stopPreviewSafe = async (liveRef) => {
  try {
    if (liveRef.current?.stopPreview) {
      await liveRef.current.stopPreview();
    }
  } catch (e) {
    // ignore
  }
};

export default function GoLive({ navigation }) {
  const InCallManager = inCallManager;
  const dispatch = useDispatch();
  const live = useSelector(selectCurrentLive); // { liveId, rtmpUrl, streamKey, playbackUrl } | null
  // ---------- Refs & state ----------
  const liveRef = useRef(null);
  const appState = useRef(AppState.currentState);
  const [showCam, setShowCam] = useState(true);
  const [front, setFront] = useState(true);
  const [arming, setArming] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [status, setStatus] = useState('idle');
  const [publishing, setPublishing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [chatLiveId, setChatLiveId] = useState(null);
  const endedRef = useRef(false);
  const allowResumeRef = useRef(true);
  const wasPublishingRef = useRef(false);
  const isFocusedRef = useRef(false);
  const opLockRef = useRef(false);
  const retryTimerRef = useRef(null);
  const unmountedRef = useRef(false);
  const lastJoinedIdRef = useRef(null);

  // Durable live id that survives Redux clears
  const liveIdRef = useRef(null);
  const audioDisabledRef = useRef(false);

  const ensureAudioOff = useCallback(async (source) => {
    if (audioDisabledRef.current) return;
    try {
      await deactivateExpoAudio();
      audioDisabledRef.current = source || 'unknown';
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Avoid reusing a stale live from the store when we enter this screen
  useEffect(() => {
    if (live?.liveId) {
      try { dispatch(clearCurrentLive()); } catch { }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the latest id (works with {liveId} or {id})
  useEffect(() => {
    const idFromStore = live?.liveId || live?.id;
    if (idFromStore) {
      liveIdRef.current = idFromStore;
      setChatLiveId(idFromStore);
    }
  }, [live?.liveId, live?.id]);

  // ---------- Helpers ----------
  const withOpLock = useCallback(async (label, fn) => {
    if (opLockRef.current) { return; }
    opLockRef.current = true;
    try { await fn(); }
    catch (e) { /* ignore */ }
    finally { opLockRef.current = false; }
  }, []);

  const navAfterTeardown = useCallback(async (navFn) => {
    tick('navAfterTeardown -> waiting settleFrames(60ms)');
    await settleFrames(60);
    navFn?.();
  }, []);

  const resolveLiveId = useCallback(() => {
    const id = liveIdRef.current || live?.liveId || live?.id || null;
    return id;
  }, [live?.liveId, live?.id]);

  // Direct HTTP fallback if thunk fails (adjust path/auth as needed)
  const stopLiveHttpFallback = useCallback(async (id) => {
    try {
      const res = await fetch('/api/liveStream/live/stop?forceStop=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await res.json().catch(() => ({}));
      return res.ok;
    } catch (e) {
      return false;
    }
  }, []);

  // ---------- Start/Stop streaming ----------
  const safeStart = useCallback(
    (key, url) =>
      withOpLock('startStreaming', async () => {
        if (endedRef.current || !allowResumeRef.current || !isFocusedRef.current || !showCam) {
          return;
        }

        if (!key || !url) {
          return;
        }

        try {
          await liveRef.current?.startStreaming?.(key, url);
        } catch (err) {
          // ignore
        }

        setStatus((prev) => (prev === 'reconnecting' ? 'reconnecting' : 'connecting'));
      }),
    [withOpLock, showCam]
  );

  const safeStop = useCallback(() => withOpLock('stopStreaming', async () => {
    try { await (liveRef.current && liveRef.current.stopStreaming && liveRef.current.stopStreaming()); }
    catch (e) { /* ignore */ }
    setPublishing(false);
    setStatus('idle');
  }), [withOpLock]);

  const scheduleRetry = useCallback(() => {
    if (endedRef.current || !allowResumeRef.current || retryTimerRef.current || !showCam) { return; }
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (wasPublishingRef.current && live && live.streamKey && live.rtmpUrl) {
        setStatus('reconnecting');
        safeStart(live.streamKey, live.rtmpUrl);
      }
    }, 800);
  }, [safeStart, showCam, live]);

  // ---------- Countdown ----------
  useEffect(() => {
    let t; if (countdown > 0) t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ---------- Elapsed timer ----------
  useEffect(() => {
    let t; if (publishing) t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [publishing]);

  // ---------- Audio session nudge (optional lib) ----------
  const stopOSAudioSession = useCallback(() => {
    try {
      InCallManager.stop();
      InCallManager.setSpeakerphoneOn?.(false);
      InCallManager.setForceSpeakerphoneOn?.(false);
      InCallManager.stopProximitySensor?.();
    } catch (e) {
      // ignore
    }
  }, []);

  // ---------- Centralized release ----------
  const releaseHardware = useCallback(async (label) => {
    resetTick();
    tick('flags:set end=true, allowResume=false');
    endedRef.current = true;
    allowResumeRef.current = false;
    wasPublishingRef.current = false;

    try { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; } catch { }

    // 1) Stop RTMP publisher first
    tick('stopPublisherSafe -> begin');
    await stopPublisherSafe(liveRef);
    tick('stopPublisherSafe -> done');

    // (Optional/harmless with current SDK)
    tick('stopPreviewSafe -> begin');
    await stopPreviewSafe(liveRef);
    tick('stopPreviewSafe -> done');

    // (Optional SDK-specific destroy/release; safe if absent)
    try {
      if (liveRef.current?.destroy) {
        await liveRef.current.destroy();
      } else if (liveRef.current?.release) {
        await liveRef.current.release();
      }
    } catch (e) {
      // ignore
    }

    // 🔑 2) End the OS audio session BEFORE removing the preview from the tree
    try {
      InCallManager.stop();
      InCallManager.setSpeakerphoneOn?.(false);
      InCallManager.setForceSpeakerphoneOn?.(false);
      InCallManager.stopProximitySensor?.();
      tick('InCallManager stopped');
    } catch (e) {
      // ignore
    }

    try {
      await ensureAudioOff('releaseHardware');
      tick('Expo AV disabled');
    } catch (e) {
      // ignore
    }

    // 3) Now reflect idle state and unmount the preview
    setPublishing(false);
    setStatus('idle');

    await settleFrames(180);

    try {
      if (liveRef.current?.destroy) {
        await liveRef.current.destroy();
      } else if (liveRef.current?.release) {
        await liveRef.current.release();
      }
    } catch (e) {
      // ignore
    }

    // 4) Finally clear the ref
    liveRef.current = null;
  }, [showCam]);

  // ---------- End flow (stop + backend stop + clear + navigate) ----------
  const endLiveCore = useCallback(
    async ({ navigate } = { navigate: true }) => {
      try {
        setIsEnding(true);
        setStatus('ending');
        endedRef.current = true;
        allowResumeRef.current = false;
        wasPublishingRef.current = false;
        try { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; } catch { }
        // 1) Tear down camera/mic and stop local RTMP publisher
        await releaseHardware('end');
        if (showCam) setShowCam(false);

        // 2) Resolve durable live id
        const targetId = resolveLiveId();
        if (targetId) {
          // 3) Stop session in backend (DB state) via thunk
          try {
            await dispatch(stopLiveSession({ liveId: targetId })).unwrap();
          } catch (e) { /* ignore */ }

          // 4) Always try server force-stop at IVS layer (safe if already offline)
          try {
            const res = await fetch('/api/liveStream/live/stop?forceStop=true', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: targetId }),
            });
            await res.json().catch(() => ({}));
            if (!res.ok) await stopLiveHttpFallback(targetId);
          } catch (e) {
            await stopLiveHttpFallback(targetId);
          }
        }

        // 5) Clear client-side state
        try { dispatch(clearCurrentLive()); } catch { }

        // 6) Navigate to summary after preview is destroyed
        if (navigate && !unmountedRef.current) {
          await navAfterTeardown(
            () => navigation.replace('LiveSummary', {
              liveId: targetId || live?.liveId,
              title: 'Live',
            })
          );
        }
      } catch (e) {
        Alert.alert('Stop failed', e?.message || 'Failed to stop');
      }
    },
    [dispatch, live, navigation, releaseHardware, navAfterTeardown, resolveLiveId, stopLiveHttpFallback]
  );

  const endLive = useCallback(() => endLiveCore({ navigate: true }), [endLiveCore]);

  // ---------- Close when idle ----------
  const onPressClose = useCallback(() => {
    if (status === 'live' || status === 'reconnecting' || publishing) {
      setIsEnding(true); setStatus('ending');
      endLive();
    } else {
      (async () => {
        setIsEnding(true); setStatus('ending');
        await releaseHardware('closeIdle');
        try { dispatch(clearCurrentLive()); } catch { }
        await navAfterTeardown(() => navigation.goBack());
      })();
    }
  }, [status, publishing, endLive, navigation, releaseHardware, dispatch, navAfterTeardown]);

  // ---------- Android back ----------
  const hardLeave = useCallback(() => {
    endLiveCore({ navigate: false }).then(async () => {
      await navAfterTeardown(() => navigation.goBack());
    });
  }, [endLiveCore, navigation, navAfterTeardown]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (status === 'live' || status === 'reconnecting' || publishing) {
        Alert.alert('End live?', 'This will stop your stream.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End & Leave', style: 'destructive', onPress: () => hardLeave() },
        ]);
        return true; // handled
      }
      (async () => {
        await releaseHardware('androidBackIdle');
        await navAfterTeardown(() => navigation.goBack());
      })();
      return true; // we navigate ourselves
    });
    return () => sub.remove();
  }, [status, publishing, hardLeave, releaseHardware, navAfterTeardown, navigation]);

  // ---------- Intercept nav away ----------
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!(status === 'live' || status === 'reconnecting' || publishing)) {
        (async () => { await releaseHardware('navAwayIdle'); dispatch(clearCurrentLive()); })();
        return;
      }
      e.preventDefault();
      Alert.alert('End live?', 'Leaving will stop your stream.', [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'End & Leave',
          style: 'destructive',
          onPress: async () => {
            await endLiveCore({ navigate: false });
            navigation.dispatch(e.data.action);
          }
        }
      ]);
    });
    return unsub;
  }, [navigation, status, publishing, endLiveCore, releaseHardware, dispatch]);

  // ---------- AppState ----------
  const pauseForBackground = useCallback(() => {
    wasPublishingRef.current = publishing;
    if (publishing) {
      setStatus('reconnecting');
      safeStop();
    }
  }, [publishing, safeStop, status]);

  const tryResume = useCallback(() => {
    if (endedRef.current || !allowResumeRef.current || !isFocusedRef.current || !showCam) return;
    if (wasPublishingRef.current && live && live.streamKey && live.rtmpUrl) {
      setStatus('reconnecting');
      safeStart(live.streamKey, live.rtmpUrl);
    }
  }, [live, safeStart, showCam]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appState.current = state;
      if (state === 'active') {
        tryResume();
      } else if (state === 'background') {
        pauseForBackground();
      }
    });
    return () => sub.remove();
  }, [pauseForBackground, tryResume]);

  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    allowResumeRef.current = true;
    tryResume();
    return () => {
      isFocusedRef.current = false;
      allowResumeRef.current = false;
      if (publishing) { safeStop(); }
    };
  }, [tryResume]));

  // ---------- Flip ----------
  const flip = useCallback(() => { setFront(v => !v); }, []);

  // ---------- Arm + countdown ----------
  const armAndCountdown = () => {
    if (arming || status === 'connecting' || status === 'live' || status === 'reconnecting') return;
    setArming(true);
    setStatus('arming');
    setCountdown(3);
  };

  useEffect(() => {
    if (arming && countdown === 0) {
      startLive();
    }
  }, [arming, countdown]);

  async function startLive() {
    try {
      endedRef.current = false;
      allowResumeRef.current = true;
      isFocusedRef.current = true;

      const res = await dispatch(startLiveSession()).unwrap();
      const url = (res && res.rtmpUrl) || (live && live.rtmpUrl);
      const key = (res && res.streamKey) || (live && live.streamKey);
      const startedId = res?.liveId || res?.id;
      if (startedId) {
        liveIdRef.current = startedId;
        setChatLiveId(startedId);
      }

      if (!url || !key) throw new Error('Missing RTMP credentials');

      setElapsed(0);
      setStatus('connecting');
      await safeStart(key, url);
    } catch (e) {
      setStatus('error');
      Alert.alert('Start failed', (e && e.message) || 'Unable to start live');
      setArming(false);
    } finally {
      setArming(false);
    }
  }

  useLiveChatSession(chatLiveId, { baseUrl: 'http://10.0.0.24:5000', backfillOnce: true });

  useEffect(() => {
    const offStart = navigation.addListener('transitionStart', () => { });
    const offEnd = navigation.addListener('transitionEnd', ({ data }) => {
      if (data?.closing) {
        (async () => {
          try { await stopPublisherSafe(liveRef); } catch { }
          try { InCallManager.stop(); } catch { }
          await ensureAudioOff('nav.transitionEnd');
        })();
      }
    });
    return () => { offStart(); offEnd(); };
  }, [navigation]);

  // ---------- Last-resort cleanup on unmount ----------
  useEffect(() => {
    return () => {
      try { clearTimeout(retryTimerRef.current); } catch { }
      (async () => {
        try {
          if (liveRef.current && liveRef.current.stopStreaming) {
            await liveRef.current.stopStreaming();
          }
        } catch (e) { }
        await ensureAudioOff('unmount');
      })();
      if (showCam) {
        setShowCam(false);
      }
      stopOSAudioSession();
    };
  }, [showCam, stopOSAudioSession]);

  // ---------- Render ----------
  const showEndButton = status === 'live' || status === 'reconnecting';

  const statusBadge = (() => {
    switch (status) {
      case 'connecting': return <Text style={S.badge}>Connecting…</Text>;
      case 'reconnecting': return <Text style={S.badge}>Reconnecting…</Text>;
      case 'live': return <Text style={[S.badge, S.badgeLive]}>LIVE</Text>;
      case 'error': return <Text style={[S.badge, S.badgeError]}>Error</Text>;
      default: return null;
    }
  })();

  function PreviewSentinel() {
    useEffect(() => {
      return () => { };
    }, []);
    return null;
  }

  useEffect(() => {
    const onFocus = () => { };
    const onBlur = () => { };
    const onState = () => { };

    const subF = navigation.addListener('focus', onFocus);
    const subB = navigation.addListener('blur', onBlur);
    const subS = navigation.addListener('state', onState);

    return () => { subF(); subB(); subS(); };
  }, [navigation]);

  useEffect(() => {
    const wrap = (name) => {
      const original = liveRef.current?.[name];
      if (!original) { return; }
      liveRef.current[name] = async (...args) => {
        try {
          const res = await original.apply(liveRef.current, args);
          return res;
        } catch (e) {
          throw e;
        }
      };
    };

    if (liveRef.current) {
      wrap('stopStreaming');
      wrap('stopPreview');
      wrap('destroy');
      wrap('release');
    }
  }, []);

  const hostLiveId = chatLiveId;

  useEffect(() => {
    if (!hostLiveId) return;

    const joined = status === 'live' || status === 'reconnecting';
    dispatch(setChatJoined({ liveStreamId: hostLiveId, joined }));

    if (joined && lastJoinedIdRef.current !== hostLiveId) {
      lastJoinedIdRef.current = hostLiveId;
      dispatch(fetchRecentChat({ liveStreamId: hostLiveId, limit: 50 }));
    }
  }, [dispatch, hostLiveId, status]);

  useEffect(() => {
    return () => {
      if (!hostLiveId) return;
      dispatch(setChatJoined({ liveStreamId: hostLiveId, joined: false }));
    };
  }, [dispatch, hostLiveId]);

  return (
    <View style={S.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          {showCam && (
            <View style={S.preview}>
              <PreviewSentinel />
              <ApiVideoLiveStreamView
                ref={liveRef}
                style={[S.preview, isEnding && S.previewHidden]}
                camera={front ? 'front' : 'back'}
                enablePinchedZoom
                video={{ fps: 30, resolution: '720p', bitrate: 1.5 * 1024 * 1024, gopDuration: 2 }}
                audio={{ bitrate: 128000, sampleRate: 44100, isStereo: true }}
                isMuted={false}
                // ====== CONNECTION GUARDS ======
                onConnectionSuccess={() => {
                  setPublishing(true);
                  setStatus('live');
                  wasPublishingRef.current = true;
                }}
                onConnectionFailed={() => {
                  if (endedRef.current) return;
                  setPublishing(false);
                  setStatus('error');
                  scheduleRetry();
                }}
                onDisconnect={() => {
                  if (endedRef.current) return;
                  setPublishing(false);
                  setStatus(wasPublishingRef.current ? 'reconnecting' : 'error');
                  scheduleRetry();
                }}
              />
              {isEnding && <View pointerEvents="none" style={S.blackout} />}
            </View>
          )}
          <View style={S.topBar}>
            <Pressable onPress={onPressClose} style={S.pill}>
              <Text style={S.pillTxt}>{showEndButton ? 'End' : 'Close'}</Text>
            </Pressable>
            {statusBadge}
            <Pressable onPress={flip} style={S.pill}><Text style={S.pillTxt}>Flip</Text></Pressable>
            <Pressable onPress={() => setShowChat(v => !v)} style={S.pill}>
              <Text style={S.pillTxt}>{showChat ? 'Hide Chat' : 'Show Chat'}</Text>
            </Pressable>
          </View>
          <View style={[S.bottomBar, isEnding && { opacity: 0.001 }]}>
            {showEndButton ? (
              <>
                <Text style={S.timer}>{formatTime(elapsed)}</Text>
                <Pressable onPress={endLive} style={[S.btn, S.end]}><Text style={S.btnTxt}>End</Text></Pressable>
              </>
            ) : countdown > 0 ? (
              <>
                <Text onPress={() => { setCountdown(0); setArming(false); setStatus('idle'); }} style={S.cancel}>Cancel</Text>
                <Text style={S.count}>{countdown}</Text>
              </>
            ) : status === 'connecting' || status === 'reconnecting' ? (
              <View style={S.connectingWrap}>
                <ActivityIndicator />
                <Text style={S.connectingTxt}>{status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</Text>
              </View>
            ) : status === 'error' ? (
              <Pressable
                onPress={() => { setStatus('idle'); armAndCountdown(); }}
                style={[S.btn, S.retry]}
              >
                <Text style={S.btnTxt}>Retry</Text>
              </Pressable>
            ) : (
              <Pressable onPress={armAndCountdown} style={S.recordBtn}><View style={S.dot} /></Pressable>
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>
      {hostLiveId && !isEnding && showChat && (
        <LiveChatOverlay liveId={hostLiveId} isHost />
      )}
    </View>
  );
}

function formatTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return m + ':' + ss;
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  preview: { flex: 1 },
  topBar: {
    position: 'absolute', top: 60, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  pill: { backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18 },
  pillTxt: { color: '#fff', fontWeight: '700' },
  badge: { color: '#ddd', fontWeight: '700' },
  badgeLive: { color: '#ff4747' },
  badgeError: { color: '#ff9e9e' },
  bottomBar: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  recordBtn: {
    width: 74, height: 74, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)'
  },
  dot: { width: 46, height: 46, borderRadius: 26, backgroundColor: '#e11d48', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  count: { color: '#fff', fontSize: 72, fontWeight: '900' },
  cancel: { color: '#fff', marginBottom: 16, fontWeight: '700' },
  timer: { color: '#fff', fontWeight: '800', marginBottom: 10 },
  btn: { backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 28 },
  end: { backgroundColor: '#ef4444' },
  retry: { backgroundColor: '#0ea5e9' },
  btnTxt: { color: '#fff', fontWeight: '700' },
  connectingWrap: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  previewHidden: { opacity: 0.001 },
  blackout: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  chatWrap: {
    position: 'absolute',
    right: 8,
    bottom: 110,
    left: 8,
    zIndex: 2,
  },
});
