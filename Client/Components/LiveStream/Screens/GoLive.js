import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, BackHandler, AppState, ActivityIndicator, InteractionManager } from 'react-native';
import { ApiVideoLiveStreamView } from '@api.video/react-native-livestream';
import { useDispatch, useSelector } from 'react-redux';
import {
  startLiveSession,
  stopLiveSession,
  selectCurrentLive,
  clearCurrentLive,
} from '../../../Slices/LiveStreamSlice';
import inCallManager from 'react-native-incall-manager';
import { useFocusEffect } from '@react-navigation/native';
import { deactivateExpoAudio, tick, resetTick } from '../../../utils/LiveStream/deactivateAudio';

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
      L?.('stopStreaming error', e?.message || e);
      done = true;
      return 'err';
    }
  })();
  await Promise.race([stop, timeout]);
};

const stopPreviewSafe = async (liveRef, L) => {
  try {
    if (liveRef.current?.stopPreview) {
      await liveRef.current.stopPreview();
      L?.('stopPreview ok');
    } else {
      L?.('stopPreview not available');
    }
  } catch (e) {
    L?.('stopPreview error', e?.message || e);
  }
};

export default function GoLive({ navigation }) {
  const InCallManager = inCallManager;
  // ---------- Logging ----------
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 8));
  const ts = () => new Date().toISOString().split('T')[1].replace('Z', '');
  const L = (...args) => console.log('[GoLive ' + instanceIdRef.current + '] ' + ts(), ...args);

  const t0Ref = useRef(0);
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

  // Status machine (authoritative for UI)
  // idle -> arming -> connecting -> live -> reconnecting (if drop) -> live
  // Any failure: error (allows retry)
  const [status, setStatus] = useState('idle');

  // “publishing” means RTMP is confirmed up (used for timer)
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
  const audioDisabledRef = useRef(false);

  const ensureAudioOff = useCallback(async (source) => {
    if (audioDisabledRef.current) {
      console.log('[AUDIO] already disabled via', audioDisabledRef.current);
      return;
    }
    try {
      await deactivateExpoAudio();
      audioDisabledRef.current = source || 'unknown';
      console.log('[AUDIO] disabled via', audioDisabledRef.current);
    } catch (e) {
      console.log('[AUDIO] deactivate error', e?.message);
    }
  }, []);

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
    tick('navAfterTeardown -> waiting settleFrames(60ms)');
    await settleFrames(60);
    console.log('[NAV] performing', label);
    navFn?.();
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
  const safeStart = useCallback(
    (key, url) =>
      withOpLock('startStreaming', async () => {
        console.log('[RTMP] start called; ref has start?', !!liveRef.current?.startStreaming);

        // Block conditions
        if (endedRef.current || !allowResumeRef.current || !isFocusedRef.current || !showCam) {
          L('safeStart blocked', {
            ended: endedRef.current,
            allow: allowResumeRef.current,
            focused: isFocusedRef.current,
            showCam,
          });
          return;
        }

        // Missing creds
        if (!key || !url) {
          L('safeStart missing creds', {
            keyPresent: !!key,
            urlPresent: !!url,
            keyLen: key ? key.length : 0,
          });
          return;
        }

        // Key + URL meta
        L('CALL startStreaming()', {
          keyLen: key.length,
          keyLast4: key.slice(-4),
          urlLen: url.length,
        });

        const t0 = Date.now();
        try {
          const result = await liveRef.current?.startStreaming?.(key, url);
          const dt = Date.now() - t0;
          L('startStreaming returned OK', { ms: dt, result });
        } catch (err) {
          const dt = Date.now() - t0;
          L('startStreaming threw error', { ms: dt, err: err?.message || err });
        }

        // Status transition
        setStatus((prev) => {
          const next = prev === 'reconnecting' ? 'reconnecting' : 'connecting';
          L('AFTER startStreaming -> status change', { from: prev, to: next });
          return next;
        });
      }),
    [withOpLock, showCam]
  );

  const safeStop = useCallback(() => withOpLock('stopStreaming', async () => {
    console.log('[RTMP] stop called; ref has stop?', !!liveRef.current?.stopStreaming);
    L('CALL stopStreaming()');
    try { await (liveRef.current && liveRef.current.stopStreaming && liveRef.current.stopStreaming()); }
    catch (e) { L('stopStreaming error:', e && (e.message || e)); }
    setPublishing(false);
    setStatus('idle');
    L('AFTER stopStreaming -> publishing=false, status=idle');
  }), [withOpLock]);

  const scheduleRetry = useCallback(() => {
    if (endedRef.current || !allowResumeRef.current || retryTimerRef.current || !showCam) { L('scheduleRetry skipped'); return; }
    L('scheduleRetry SET (800ms)');
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (wasPublishingRef.current && live && live.streamKey && live.rtmpUrl) {
        L('scheduleRetry firing safeStart');
        setStatus('reconnecting');
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
      L('InCallManager present:', !!InCallManager?.stop);
      InCallManager.stop();
      InCallManager.setSpeakerphoneOn?.(false);
      InCallManager.setForceSpeakerphoneOn?.(false);
      InCallManager.stopProximitySensor?.();
      L('InCallManager.stop() called');
    } catch (e) {
      L('InCallManager not available', e?.message);
    }
  }, []);

  // ---------- Centralized release ----------
  const releaseHardware = useCallback(async (label) => {
    resetTick();
    console.log('──────── TEARDOWN BEGIN (' + label + ') ────────');
    tick('flags:set end=true, allowResume=false');
    endedRef.current = true;
    allowResumeRef.current = false;
    wasPublishingRef.current = false;

    try { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; } catch { }

    // 1) Stop RTMP publisher first
    tick('stopPublisherSafe -> begin');
    await stopPublisherSafe(liveRef, console.log);
    tick('stopPublisherSafe -> done');

    // (Optional/harmless with current SDK)
    tick('stopPreviewSafe -> begin');
    await stopPreviewSafe(liveRef, console.log);
    tick('stopPreviewSafe -> done');

    // (Optional SDK-specific destroy/release; safe if absent)
    try {
      if (liveRef.current?.destroy) {
        await liveRef.current.destroy();
        console.log('publisher.destroy ok');
      } else if (liveRef.current?.release) {
        await liveRef.current.release();
        console.log('publisher.release ok');
      }
    } catch (e) {
      console.log('publisher destroy/release error', e?.message);
    }

    // 🔑 2) End the OS audio session BEFORE removing the preview from the tree
    try {
      console.log('[AUDIO] InCallManager.stop()');
      InCallManager.stop();
      InCallManager.setSpeakerphoneOn?.(false);
      InCallManager.setForceSpeakerphoneOn?.(false);
      InCallManager.stopProximitySensor?.();
      tick('InCallManager stopped');
    } catch (e) {
      console.log('[AUDIO] InCallManager error', e?.message);
    }

    try {
      console.log('[AUDIO] Expo AV deactivate');
      await ensureAudioOff('releaseHardware');
      tick('Expo AV disabled');
    } catch (e) {
      console.log('[AUDIO] Expo AV error', e?.message);
    }

    // 3) Now reflect idle state and unmount the preview
    setPublishing(false);
    setStatus('idle');

    await settleFrames(180);

    try {
      if (liveRef.current?.destroy) {
        L('[DISPOSE] calling destroy()');
        await liveRef.current.destroy();
      } else if (liveRef.current?.release) {
        L('[DISPOSE] calling release()');
        await liveRef.current.release();
      } else {
        L('[DISPOSE] no destroy/release available');
      }
    } catch (e) {
      L('[DISPOSE] error', e?.message);
    }

    // 4) Finally clear the ref
    liveRef.current = null;

    console.log('──────── TEARDOWN END (' + label + ') ────────');
  }, [showCam]);

  // ---------- End flow (stop + backend stop + clear + navigate) ----------
  const endLiveCore = useCallback(
    async ({ navigate } = { navigate: true }) => {
      L('endLiveCore START', { navigate });
      try {
                setIsEnding(true);
        setStatus('ending'); // optional badge/guard
        endedRef.current = true;
        allowResumeRef.current = false;
        wasPublishingRef.current = false;
        try { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; } catch {}
        // 1) Tear down camera/mic and stop local RTMP publisher
        await releaseHardware('end');
        if (showCam) setShowCam(false)

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
            if (!res.ok) await stopLiveHttpFallback(targetId);
          } catch (e) {
            L('HTTP forceStop ERR', e?.message || e);
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
    [dispatch, live, navigation, releaseHardware, navAfterTeardown, resolveLiveId, stopLiveHttpFallback]
  );

  const endLive = useCallback(() => endLiveCore({ navigate: true }), [endLiveCore]);

  // ---------- Close when idle ----------
  const onPressClose = useCallback(() => {
    L('onPressClose status=', status, 'publishing=', publishing);
    if (status === 'live' || status === 'reconnecting' || publishing) {
      setIsEnding(true); setStatus('ending'); // hide immediately
      endLive();
    } else {
      (async () => {
        setIsEnding(true); setStatus('ending');
        await releaseHardware('closeIdle');
        try { dispatch(clearCurrentLive()); } catch { }
        await navAfterTeardown(() => navigation.goBack(), 'goBack()');
      })();
    }
  }, [status, publishing, endLive, navigation, releaseHardware, dispatch, navAfterTeardown]);

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
      L('hardwareBackPress status=', status, 'publishing=', publishing);
      if (status === 'live' || status === 'reconnecting' || publishing) {
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
  }, [status, publishing, hardLeave, releaseHardware, navAfterTeardown, navigation]);

  // ---------- Intercept nav away ----------
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      L('beforeRemove fired; status=', status, 'publishing=', publishing);
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
            L('beforeRemove confirm -> endLiveCore');
            await endLiveCore({ navigate: false });
            L('beforeRemove dispatch original action');
            navigation.dispatch(e.data.action);
          }
        }
      ]);
    });
    return unsub;
  }, [navigation, status, publishing, endLiveCore, releaseHardware, dispatch]);

  // ---------- AppState ----------
  const pauseForBackground = useCallback(() => {
    L('pauseForBackground; status=', status, 'publishing=', publishing);
    wasPublishingRef.current = publishing;
    if (publishing) {
      setStatus('reconnecting'); // we’ll try to come back as 'reconnecting'
      safeStop();
    }
  }, [publishing, safeStop, status]);

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
      setStatus('reconnecting');
      safeStart(live.streamKey, live.rtmpUrl);
    }
  }, [live, safeStart, showCam]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      console.log('[APPSTATE]', state, 'ended=', endedRef.current, 'showCam=', showCam);
      appState.current = state;
      if (state === 'active') {
        tryResume();
      } else if (state === 'background') {
        // Only background warrants stopping RTMP
        pauseForBackground();
      } else {
        // iOS 'inactive' — do nothing; keep preview alive
      }
    });
    return () => sub.remove();
  }, [pauseForBackground, tryResume]);

  useFocusEffect(useCallback(() => {
    console.log('[FOCUS] IN');
    isFocusedRef.current = true;
    allowResumeRef.current = true;
    tryResume();
    return () => {
      console.log('[FOCUS] OUT');
      isFocusedRef.current = false;
      allowResumeRef.current = false;
      if (publishing) { safeStop(); }
    };
  }, [tryResume]));

  // ---------- Flip ----------
  const flip = useCallback(() => { setFront(v => !v); L('flip -> front=', !front); }, [front]);

  // ---------- Arm + countdown ----------
  const armAndCountdown = () => {
    L('armAndCountdown; arming=', arming, 'status=', status);
    if (arming || status === 'connecting' || status === 'live' || status === 'reconnecting') return;
    setArming(true);
    setStatus('arming');
    setCountdown(3);
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

      setElapsed(0);
      setStatus('connecting');
      await safeStart(key, url);
      L('startLive END OK (awaiting onConnectionSuccess)');
    } catch (e) {
      L('startLive ERR', e && (e.message || e));
      setStatus('error');
      Alert.alert('Start failed', (e && e.message) || 'Unable to start live');
      setArming(false);
    } finally {
      setArming(false);
    }
  }

  useEffect(() => {
    const offStart = navigation.addListener('transitionStart', ({ data }) => {
      console.log('[NAV] transitionStart', data);
    });
    const offEnd = navigation.addListener('transitionEnd', ({ data }) => {
      console.log('[NAV] transitionEnd', data);
      if (data?.closing) {
        console.log('[NAV] closing -> ensuring audio/cam killed');
        (async () => {
          try { await stopPublisherSafe(liveRef, console.log); } catch { }
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
      L('UNMOUNT cleanup entered');
      try { clearTimeout(retryTimerRef.current); } catch { }
      (async () => {
        try {
          if (liveRef.current && liveRef.current.stopStreaming) {
            await liveRef.current.stopStreaming();
            L('UNMOUNT stopStreaming called');
          }
        } catch (e) { }
        await ensureAudioOff('unmount');
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

  function PreviewSentinel({ onUnmount }) {
    useEffect(() => {
      console.log('[PREVIEW] mounted');
      return () => {
        console.log('[PREVIEW] unmounted');
        onUnmount?.();
      };
    }, []);
    return null;
  }

  useEffect(() => {
    const onFocus = () => L('[NAV:LIFECYCLE] focus');
    const onBlur = () => L('[NAV:LIFECYCLE] blur (stack-level)');
    const onState = () => {
      const state = navigation.getState?.();
      L('[NAV:STATE]', JSON.stringify({ index: state?.index, routes: state?.routes?.map(r => r.name) }));
    };

    const subF = navigation.addListener('focus', onFocus);
    const subB = navigation.addListener('blur', onBlur);
    const subS = navigation.addListener('state', onState);

    return () => { subF(); subB(); subS(); };
  }, [navigation]);

  useEffect(() => {
    const wrap = (name) => {
      const original = liveRef.current?.[name];
      if (!original) { L(`[REF] ${name} not present`); return; }
      liveRef.current[name] = async (...args) => {
        L(`[REF] ${name} CALL →`, args);
        const t0 = Date.now();
        try {
          const res = await original.apply(liveRef.current, args);
          L(`[REF] ${name} OK (${Date.now() - t0}ms)`);
          return res;
        } catch (e) {
          L(`[REF] ${name} ERR`, e?.message || e);
          throw e;
        }
      };
      L(`[REF] ${name} wrapped`);
    };

    if (liveRef.current) {
      wrap('stopStreaming');
      wrap('stopPreview');
      wrap('destroy');
      wrap('release');
    } else {
      L('[REF] liveRef.current is null at wrap time');
    }
  }, []);

  return (
    <View style={S.container}>
      {showCam && (
        <View style={S.preview}>
          <PreviewSentinel onUnmount={() => console.log('[PREVIEW] unmount callback fired')} />
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
              L('RTMP onConnectionSuccess');
              setPublishing(true);
              setStatus('live');
              wasPublishingRef.current = true;
            }}
            onConnectionFailed={() => {
              if (endedRef.current) return;       // ✅ ignore after end
              setPublishing(false);
              setStatus('error');
              scheduleRetry();
            }}
            onDisconnect={() => {
              if (endedRef.current) return;       // ✅ ignore after we decided to end
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
      </View>
      <View style={[S.bottomBar, isEnding && { opacity: 0.001 } /* freeze controls */]}>
        {showEndButton ? (
          <>
            <Text style={S.timer}>{formatTime(elapsed)}</Text>
            <Pressable onPress={endLive} style={[S.btn, S.end]}><Text style={S.btnTxt}>End</Text></Pressable>
          </>
        ) : countdown > 0 ? (
          <>
            <Text onPress={() => { L('COUNTDOWN CANCEL'); setCountdown(0); setArming(false); setStatus('idle'); }} style={S.cancel}>Cancel</Text>
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
  previewHidden: { opacity: 0.001 }, // visually gone, ref stays valid for teardown
  blackout: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
});
