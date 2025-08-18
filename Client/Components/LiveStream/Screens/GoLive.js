import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, BackHandler, AppState } from 'react-native';
import { ApiVideoLiveStreamView } from '@api.video/react-native-livestream';
import { useDispatch, useSelector } from 'react-redux';
import {
  startLiveSession,
  stopLiveSession,
  selectCurrentLive,
  clearCurrentLive,
} from '../../../Slices/LiveStreamSlice';
import { useFocusEffect } from '@react-navigation/native';

export default function GoLive({ navigation }) {
  // ---------- Logging ----------
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 8));
  const ts = () => new Date().toISOString().split('T')[1].replace('Z', '');
  const L = (...args) => console.log('[GoLive ' + instanceIdRef.current + '] ' + ts(), ...args);

  const dispatch = useDispatch();
  const live = useSelector(selectCurrentLive); // { liveId, rtmpUrl, streamKey, playbackUrl } | null

  // ---------- Refs & state ----------
  const liveRef = useRef(null);
  const appState = useRef(AppState.currentState);

  const [showCam, setShowCam] = useState(true);
  const [front, setFront] = useState(true);
  const [arming, setArming] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const endedRef = useRef(false);
  const allowResumeRef = useRef(true);
  const wasPublishingRef = useRef(false);
  const isFocusedRef = useRef(false);
  const opLockRef = useRef(false);
  const retryTimerRef = useRef(null);
  const unmountedRef = useRef(false);
  const navPendingRef = useRef(false);

  // Durable live id that survives Redux clears
  const liveIdRef = useRef(null);

  useEffect(() => {
    L('MOUNT');
    return () => {
      L('UNMOUNT begin');
      unmountedRef.current = true;
    };
  }, []);

  // Avoid reusing a stale live from the store when we enter this screen
  useEffect(() => {
    if (live?.liveId) {
      L('Clearing stale live from store on mount', live.liveId);
      try { dispatch(clearCurrentLive()); } catch { }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the latest id (works with {liveId} or {id})
  useEffect(() => {
    const idFromStore = live?.liveId || live?.id;
    if (idFromStore) {
      liveIdRef.current = idFromStore;
      L('liveIdRef <- from store', idFromStore);
    }
  }, [live?.liveId, live?.id]);

  // ---------- Helpers ----------
  const withOpLock = useCallback(async (label, fn) => {
    if (opLockRef.current) { L('LOCK BUSY skip:', label); return; }
    opLockRef.current = true;
    L('LOCK ENTER:', label);
    try { await fn(); }
    catch (e) { L('ERR in', label, e && (e.message || e)); }
    finally { opLockRef.current = false; L('LOCK EXIT:', label); }
  }, []);

  const navAfterTeardown = useCallback(async (navFn, label = 'nav') => {
    if (navPendingRef.current) return;
    navPendingRef.current = true;
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
    L('NAV NOW - preview destroyed ->', label);
    if (!unmountedRef.current) navFn();
  }, []);

  const resolveLiveId = useCallback(() => {
    const id = liveIdRef.current || live?.liveId || live?.id || null;
    L('resolveLiveId ->', id, { fromRef: liveIdRef.current, fromStoreLiveId: live?.liveId, fromStoreId: live?.id });
    return id;
  }, [live?.liveId, live?.id]);

  // Direct HTTP fallback if thunk fails (adjust path/auth as needed)
  const stopLiveHttpFallback = useCallback(async (id) => {
    try {
      L('HTTP fallback /live/stop', id);
      const res = await fetch('/api/liveStream/live/stop?forceStop=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      L('HTTP fallback /live/stop result', { status: res.status, data });
      return res.ok;
    } catch (e) {
      L('HTTP fallback /live/stop ERROR', e?.message);
      return false;
    }
  }, []);

  // ---------- Start/Stop streaming ----------
  const safeStart = useCallback((key, url) => withOpLock('startStreaming', async () => {
    if (endedRef.current || !allowResumeRef.current || !isFocusedRef.current || !showCam) { L('safeStart blocked'); return; }
    if (!key || !url) { L('safeStart missing creds'); return; }
    L('CALL startStreaming()', { keyTail: key && key.slice(-4), hasUrl: !!url });
    await (liveRef.current && liveRef.current.startStreaming && liveRef.current.startStreaming(key, url));
    setPublishing(true);
    L('AFTER startStreaming -> publishing=true');
  }), [withOpLock, showCam]);

  const safeStop = useCallback(() => withOpLock('stopStreaming', async () => {
    L('CALL stopStreaming()');
    try { await (liveRef.current && liveRef.current.stopStreaming && liveRef.current.stopStreaming()); }
    catch (e) { L('stopStreaming error:', e && (e.message || e)); }
    setPublishing(false);
    L('AFTER stopStreaming -> publishing=false');
  }), [withOpLock]);

  const scheduleRetry = useCallback(() => {
    if (endedRef.current || !allowResumeRef.current || retryTimerRef.current || !showCam) { L('scheduleRetry skipped'); return; }
    L('scheduleRetry SET (800ms)');
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (wasPublishingRef.current && live && live.streamKey && live.rtmpUrl) {
        L('scheduleRetry firing safeStart');
        safeStart(live.streamKey, live.rtmpUrl);
      } else {
        L('scheduleRetry no-op');
      }
    }, 800);
  }, [safeStart, showCam, live]);

  // ---------- Countdown ----------
  useEffect(() => {
    if (countdown > 0) L('COUNTDOWN', countdown);
    let t; if (countdown > 0) t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ---------- Elapsed timer ----------
  useEffect(() => {
    L('TIMER publishing=', publishing);
    let t; if (publishing) t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [publishing]);

  // ---------- Audio session nudge (optional lib) ----------
  const stopOSAudioSession = useCallback(() => {
    try {
      const InCallManager = require('react-native-incall-manager');
      L('InCallManager present:', !!InCallManager?.stop);
      InCallManager.stop();
      InCallManager.setSpeakerphoneOn?.(false);
      L('InCallManager.stop() called');
    } catch (e) {
      L('InCallManager not available', e?.message);
    }
  }, []);

  // ---------- Centralized release ----------
  const releaseHardware = useCallback(async (label) => {
    L('releaseHardware START', label);
    endedRef.current = true;
    allowResumeRef.current = false;
    wasPublishingRef.current = false;
    try { clearTimeout(retryTimerRef.current); } catch { }

    await safeStop();

    if (showCam) {
      L('unmountPreview(' + label + ') -> setShowCam(false)');
      setShowCam(false);
    }

    await new Promise(r => setTimeout(r, 150));
    stopOSAudioSession();
    liveRef.current = null;

    L('releaseHardware DONE', label);
  }, [safeStop, showCam, stopOSAudioSession]);

  // ---------- End flow (stop + backend stop + clear + navigate) ----------
  const endLiveCore = useCallback(
    async ({ navigate } = { navigate: true }) => {
      L('endLiveCore START', { navigate });
      try {
        // 1) Tear down camera/mic and stop local RTMP publisher
        await releaseHardware('end');

        // 2) Resolve durable live id
        const targetId = resolveLiveId();
        if (!targetId) {
          L('NO LIVE ID — skipping /live/stop call');
        } else {
          // 3) Stop session in backend (DB state) via thunk
          try {
            await dispatch(stopLiveSession({ liveId: targetId })).unwrap();
            L('stopLiveSession OK', targetId);
          } catch (e) {
            L('stopLiveSession ERR (thunk)', e?.message || e);
          }

          // 4) Always try server force-stop at IVS layer (safe if already offline)
          try {
            L('HTTP forceStop -> /live/stop');
            const res = await fetch('/api/liveStream/live/stop?forceStop=true', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: targetId }),
            });
            const data = await res.json().catch(() => ({}));
            L('HTTP forceStop result', { status: res.status, ok: res.ok, data });
            // If forceStop failed at HTTP layer, also try your existing fallback
            if (!res.ok) await stopLiveHttpFallback(targetId);
          } catch (e) {
            L('HTTP forceStop ERR', e?.message || e);
            // Last-ditch fallback
            await stopLiveHttpFallback(targetId);
          }
        }

        // 5) Clear client-side state
        try {
          dispatch(clearCurrentLive());
        } catch { }

        // 6) Navigate to summary after preview is destroyed
        if (navigate && !unmountedRef.current) {
          await navAfterTeardown(
            () =>
              navigation.replace('LiveSummary', {
                liveId: targetId || live?.liveId,
                title: 'Live',
              }),
            'replace(LiveSummary)'
          );
        }
      } catch (e) {
        L('endLiveCore ERR', e?.message || e);
        Alert.alert('Stop failed', e?.message || 'Failed to stop');
      } finally {
        L('endLiveCore END');
      }
    },
    [
      dispatch,
      live,
      navigation,
      releaseHardware,
      navAfterTeardown,
      resolveLiveId,
      stopLiveHttpFallback,
    ]
  );

  const endLive = useCallback(() => endLiveCore({ navigate: true }), [endLiveCore]);

  // ---------- Close when idle ----------
  const onPressClose = useCallback(() => {
    L('onPressClose publishing=', publishing);
    if (publishing) {
      endLive();
    } else {
      (async () => {
        await releaseHardware('closeIdle');
        try { dispatch(clearCurrentLive()); } catch { }
        await navAfterTeardown(() => navigation.goBack(), 'goBack()');
      })();
    }
  }, [publishing, endLive, navigation, releaseHardware, dispatch, navAfterTeardown]);

  // ---------- Android back ----------
  const hardLeave = useCallback(() => {
    L('hardLeave');
    endLiveCore({ navigate: false }).then(async () => {
      L('hardLeave -> goBack');
      await navAfterTeardown(() => navigation.goBack(), 'goBack() from hardLeave');
    });
  }, [endLiveCore, navigation, navAfterTeardown]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      L('hardwareBackPress publishing=', publishing);
      if (publishing) {
        Alert.alert('End live?', 'This will stop your stream.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End & Leave', style: 'destructive', onPress: () => hardLeave() },
        ]);
        return true; // handled
      }
      (async () => {
        await releaseHardware('androidBackIdle');
        await navAfterTeardown(() => navigation.goBack(), 'goBack() from androidBackIdle');
      })();
      return true; // we navigate ourselves
    });
    return () => sub.remove();
  }, [publishing, hardLeave, releaseHardware, navAfterTeardown, navigation]);

  // ---------- Intercept nav away ----------
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      L('beforeRemove fired; publishing=', publishing);
      if (!publishing) {
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
            L('beforeRemove confirm -> endLiveCore');
            await endLiveCore({ navigate: false });
            L('beforeRemove dispatch original action');
            navigation.dispatch(e.data.action);
          }
        }
      ]);
    });
    return unsub;
  }, [navigation, publishing, endLiveCore, releaseHardware, dispatch]);

  // ---------- AppState ----------
  const pauseForBackground = useCallback(() => {
    L('pauseForBackground; publishing=', publishing);
    wasPublishingRef.current = publishing;
    if (publishing) safeStop();
  }, [publishing, safeStop]);

  const tryResume = useCallback(() => {
    L('tryResume check', {
      ended: endedRef.current,
      allow: allowResumeRef.current,
      focused: isFocusedRef.current,
      showCam: showCam,
      wasPublishing: wasPublishingRef.current
    });
    if (endedRef.current || !allowResumeRef.current || !isFocusedRef.current || !showCam) return;
    if (wasPublishingRef.current && live && live.streamKey && live.rtmpUrl) {
      safeStart(live.streamKey, live.rtmpUrl);
    }
  }, [live, safeStart, showCam]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      L('AppState change ->', state);
      appState.current = state;
      if (state === 'active') tryResume();
      else pauseForBackground();
    });
    return () => sub.remove();
  }, [pauseForBackground, tryResume]);

  // ---------- Focus ----------
  useFocusEffect(
    useCallback(() => {
      L('FOCUS IN');
      isFocusedRef.current = true;
      allowResumeRef.current = true;
      tryResume();
      return () => {
        L('FOCUS OUT');
        isFocusedRef.current = false;
        allowResumeRef.current = false;
        pauseForBackground();
      };
    }, [pauseForBackground, tryResume])
  );

  // ---------- Flip ----------
  const flip = useCallback(() => { setFront(v => !v); L('flip -> front=', !front); }, [front]);

  // ---------- Arm + countdown ----------
  const armAndCountdown = () => {
    L('armAndCountdown; arming=', arming, 'publishing=', publishing);
    if (arming || publishing) return;
    setArming(true); setCountdown(3);
  };

  useEffect(() => {
    if (arming && countdown === 0) {
      L('COUNTDOWN DONE -> startLive');
      startLive();
    }
  }, [arming, countdown]);

  async function startLive() {
    L('startLive BEGIN');
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
        L('liveIdRef <- from start response', startedId);
      }
      L('startLive creds', { hasUrl: !!url, keyTail: key && key.slice(-4) });

      if (!url || !key) throw new Error('Missing RTMP credentials');

      wasPublishingRef.current = true;
      setElapsed(0);
      await safeStart(key, url);
      L('startLive END OK');
    } catch (e) {
      L('startLive ERR', e && (e.message || e));
      Alert.alert('Start failed', (e && e.message) || 'Unable to start live');
      setArming(false);
    }
  }

  // ---------- Last-resort cleanup on unmount ----------
  useEffect(() => {
    return () => {
      L('UNMOUNT cleanup entered');
      try { clearTimeout(retryTimerRef.current); } catch { }
      (async () => {
        try {
          if (liveRef.current && liveRef.current.stopStreaming) {
            await liveRef.current.stopStreaming();
            L('UNMOUNT stopStreaming called');
          }
        } catch (e) { }
      })();
      if (showCam) {
        L('UNMOUNT setShowCam(false)');
        setShowCam(false);
      }
      stopOSAudioSession();
      L('UNMOUNT cleanup exit');
    };
  }, [showCam, stopOSAudioSession]);

  // ---------- Render ----------
  return (
    <View style={S.container}>
      {showCam && (
        <ApiVideoLiveStreamView
          ref={liveRef}
          style={S.preview}
          camera={front ? 'front' : 'back'}
          enablePinchedZoom
          video={{ fps: 30, resolution: '720p', bitrate: 1.5 * 1024 * 1024, gopDuration: 2 }}
          audio={{ bitrate: 128000, sampleRate: 44100, isStereo: true }}
          isMuted={false}
          onConnectionSuccess={() => { L('RTMP onConnectionSuccess'); }}
          onConnectionFailed={(code) => { L('RTMP onConnectionFailed', code); scheduleRetry(); }}
          onDisconnect={() => { L('RTMP onDisconnect'); scheduleRetry(); }}
        />
      )}

      <View style={S.topBar}>
        <Pressable onPress={onPressClose} style={S.pill}>
          <Text style={S.pillTxt}>{publishing ? 'End' : 'Close'}</Text>
        </Pressable>
        <Pressable onPress={flip} style={S.pill}><Text style={S.pillTxt}>Flip</Text></Pressable>
      </View>

      <View style={S.bottomBar}>
        {publishing ? (
          <>
            <Text style={S.timer}>{formatTime(elapsed)}</Text>
            <Pressable onPress={endLive} style={[S.btn, S.end]}><Text style={S.btnTxt}>End</Text></Pressable>
          </>
        ) : countdown > 0 ? (
          <>
            <Text onPress={() => { L('COUNTDOWN CANCEL'); setCountdown(0); setArming(false); }} style={S.cancel}>Cancel</Text>
            <Text style={S.count}>{countdown}</Text>
          </>
        ) : (
          <Pressable onPress={armAndCountdown} style={S.recordBtn}><View style={S.dot} /></Pressable>
        )}
      </View>
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
  btnTxt: { color: '#fff', fontWeight: '700' }
});
