import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState, Alert } from 'react-native';
import { useDispatch } from 'react-redux';
import { startLiveSession, stopLiveSession, clearCurrentLive } from '../../../Slices/LiveStreamSlice';
import { useFocusEffect } from '@react-navigation/native';

const TAG = '[usePublisher]';
const DEBUG = true;

const log  = (...a) => { if (DEBUG) console.log(TAG, ...a); };
const warn = (...a) => { if (DEBUG) console.warn(TAG, ...a); };
const err  = (...a) => { if (DEBUG) console.error(TAG, ...a); };

const settleFrames = async (ms = 120) => {
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, ms));
};

const initialUI = {
  showCam: true,
  front: true,
  arming: false,
  countdown: 0,
  isEnding: false,
  showChat: true,
  status: 'idle', // 'idle'|'arming'|'connecting'|'live'|'reconnecting'|'ending'|'error'
  publishing: false,
  elapsed: 0,
  chatLiveId: null,
};

function uiReducer(state, action) {
  if (DEBUG) {
    log('🧮 uiReducer called', { actionType: action.type, patch: action.patch, prev: state });
  }

  switch (action.type) {
    case 'SET': {
      const next = { ...state, ...action.patch };
      if (DEBUG) log('🧮 uiReducer SET → next state', next);
      return next;
    }
    case 'INC_ELAPSED': {
      const next = { ...state, elapsed: state.elapsed + 1 };
      if (DEBUG) log('🧮 uiReducer INC_ELAPSED →', next.elapsed);
      return next;
    }
    case 'DEC_COUNTDOWN': {
      const next = { ...state, countdown: Math.max(0, state.countdown - 1) };
      if (DEBUG) log('🧮 uiReducer DEC_COUNTDOWN →', next.countdown);
      return next;
    }
    default:
      if (DEBUG) warn('🧮 uiReducer unknown action', action);
      return state;
  }
}

export function usePublisher({ liveRef, navigation, liveFromStore }) {
  log('↩️ usePublisher init', {
    liveFromStoreSnapshot: liveFromStore,
  });

  const dispatch = useDispatch();
  const [ui, setUI] = useReducer(uiReducer, initialUI);

  // Serialize operations on the SDK so we never call start/stop concurrently
  const opQueueRef = useRef(Promise.resolve());

  // Imperative runtime flags
  const R = useRef({
    ended: false,
    allowResume: true,
    wasPublishing: false,
    isFocused: false,
    retryTimer: null,
    unmounted: false,
    liveId: null,
    bgPaused: false,
  }).current;

  const dumpRuntimeFlags = (label) => {
    if (!DEBUG) return;
    log(label, {
      ended: R.ended,
      allowResume: R.allowResume,
      wasPublishing: R.wasPublishing,
      isFocused: R.isFocused,
      retryTimerActive: !!R.retryTimer,
      unmounted: R.unmounted,
      liveId: R.liveId,
      bgPaused: R.bgPaused,
    });
  };

  const safeSetUI = useCallback(
    (patch) => {
      if (R.unmounted) {
        warn('safeSetUI called after unmount, ignoring', patch);
        return;
      }
      if (DEBUG) log('safeSetUI', patch);
      setUI({ type: 'SET', patch });
    },
    [R],
  );

  // Keep durable live id and chat id synced
  useEffect(() => {
    const id = liveFromStore?.liveId || liveFromStore?.id;
    log('💾 liveFromStore id effect fired', {
      liveFromStore,
      resolvedId: id,
    });

    if (id) {
      R.liveId = id;
      safeSetUI({ chatLiveId: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFromStore?.liveId, liveFromStore?.id]);

  // Elapsed timer
  useEffect(() => {
    let t;
    if (ui.publishing) {
      log('⏱ starting elapsed timer', { publishing: ui.publishing });
      t = setInterval(() => {
        if (!R.unmounted) {
          setUI({ type: 'INC_ELAPSED' });
        } else {
          warn('elapsed timer tick after unmount, skipping');
        }
      }, 1000);
    } else {
      log('⏱ elapsed timer inactive (publishing=false)');
    }

    return () => {
      if (t) {
        log('⏱ clearing elapsed timer');
        clearInterval(t);
      }
    };
  }, [ui.publishing, R]);

  // Countdown
  useEffect(() => {
    let t;
    log('⏳ countdown effect fired', {
      arming: ui.arming,
      countdown: ui.countdown,
    });

    if (ui.arming && ui.countdown > 0) {
      log('⏳ starting countdown interval');
      t = setInterval(() => {
        if (!R.unmounted) {
          setUI({ type: 'DEC_COUNTDOWN' });
        } else {
          warn('countdown tick after unmount, skipping');
        }
      }, 1000);
    } else if (ui.arming && ui.countdown === 0) {
      log('⏳ countdown reached zero → startLive guard check', {
        ended: R.ended,
        unmounted: R.unmounted,
      });
      // guard startLive so it can't run after unmount/end
      if (!R.unmounted && !R.ended) {
        log('⏳ calling startLive from countdown effect');
        startLive();
      } else {
        warn('⏳ startLive aborted due to ended/unmounted flags');
      }
    } else {
      log('⏳ countdown idle (either not arming or countdown==0 and already handled)');
    }

    return () => {
      if (t) {
        log('⏳ clearing countdown interval');
        clearInterval(t);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.arming, ui.countdown, R]);

  const withOpLock = useCallback(
    (fn) => {
      log('🔐 withOpLock scheduled fn');
      const run = async () => {
        try {
          log('🔐 withOpLock run start');
          await fn();
          log('🔐 withOpLock run success');
        } catch (e) {
          warn('🔐 withOpLock fn threw', e);
        }
      };

      opQueueRef.current = opQueueRef.current.then(run, run);
      return opQueueRef.current;
    },
    [],
  );

  const safeStart = useCallback(
    (key, url) =>
      withOpLock(async () => {
        dumpRuntimeFlags('🚀 safeStart entry');
        log('🚀 safeStart called with', { key: !!key, url: !!url });

        if (R.unmounted || R.ended) {
          warn('🚀 safeStart abort: unmounted or ended', {
            unmounted: R.unmounted,
            ended: R.ended,
          });
          return;
        }
        if (!R.allowResume || !R.isFocused || !ui.showCam || !key) {
          warn('🚀 safeStart abort: guard failed', {
            allowResume: R.allowResume,
            isFocused: R.isFocused,
            showCam: ui.showCam,
            hasKey: !!key,
          });
          return;
        }

        const inst = liveRef.current;
        log('🚀 safeStart liveRef.current', {
          hasInst: !!inst,
          hasStartFn: !!(inst && typeof inst.startStreaming === 'function'),
          hasIsStreaming: !!(inst && inst.isStreaming),
        });

        if (!inst || typeof inst.startStreaming !== 'function') {
          warn('🚀 startStreaming not available yet', { inst });
          return;
        }

        const isStreamingFlag =
          typeof inst.isStreaming === 'function' ? inst.isStreaming() : inst.isStreaming;

        log('🚀 safeStart isStreamingFlag', isStreamingFlag);

        if (isStreamingFlag) {
          log('🚀 safeStart early exit: already streaming');
          return;
        }

        try {
          log('🚀 calling inst.startStreaming(...)');
          await inst.startStreaming(key, url);
          log('🚀 inst.startStreaming resolved OK');
          safeSetUI({
            status: ui.status === 'reconnecting' ? 'reconnecting' : 'connecting',
          });
        } catch (e) {
          warn('🚀 startStreaming threw', e);
        }
      }),
    [liveRef, R, ui.showCam, ui.status, withOpLock, safeSetUI],
  );

  const safeStop = useCallback(
    () =>
      withOpLock(async () => {
        dumpRuntimeFlags('🛑 safeStop entry');
        const inst = liveRef.current;
        log('🛑 safeStop liveRef.current', {
          hasInst: !!inst,
          hasStopFn: !!(inst && typeof inst.stopStreaming === 'function'),
        });

        if (R.unmounted) {
          warn('🛑 safeStop abort: unmounted');
          return;
        }

        if (!inst || typeof inst.stopStreaming !== 'function') {
          warn('🛑 stopStreaming not available', { inst });
          safeSetUI({ publishing: false, status: 'idle' });
          return;
        }

        try {
          log('🛑 calling inst.stopStreaming()');
          await inst.stopStreaming();
          log('🛑 inst.stopStreaming resolved OK');
        } catch (e) {
          warn('🛑 stopStreaming threw', e);
        }
        safeSetUI({ publishing: false, status: 'idle' });
      }),
    [liveRef, withOpLock, safeSetUI, R],
  );

  const scheduleRetry = useCallback(
    () => {
      dumpRuntimeFlags('🔁 scheduleRetry entry');
      log('🔁 scheduleRetry called with ui', {
        status: ui.status,
        publishing: ui.publishing,
        showCam: ui.showCam,
      });

      if (R.unmounted || R.ended) {
        warn('🔁 scheduleRetry abort: unmounted or ended');
        return;
      }
      if (!R.allowResume || R.retryTimer || !ui.showCam) {
        warn('🔁 scheduleRetry abort: guard failed', {
          allowResume: R.allowResume,
          hasRetryTimer: !!R.retryTimer,
          showCam: ui.showCam,
        });
        return;
      }
      if (ui.publishing || ui.status === 'live' || ui.status === 'connecting') {
        warn('🔁 scheduleRetry abort: already publishing/live/connecting');
        return;
      }

      log('🔁 setting retryTimer...');
      R.retryTimer = setTimeout(() => {
        dumpRuntimeFlags('🔁 retryTimer fired');
        if (R.unmounted || R.ended) {
          warn('🔁 retryTimer abort: unmounted or ended');
          return;
        }
        R.retryTimer = null;
        if (R.wasPublishing && liveFromStore?.streamKey && liveFromStore?.rtmpUrl) {
          log('🔁 retryTimer → safeStart with stored creds');
          safeSetUI({ status: 'reconnecting' });
          safeStart(liveFromStore.streamKey, liveFromStore.rtmpUrl);
        } else {
          warn('🔁 retryTimer: no creds or wasPublishing=false, skipping');
        }
      }, 900);
    },
    [liveFromStore, safeStart, ui.publishing, ui.showCam, ui.status, R, safeSetUI],
  );

  const resolveLiveId = useCallback(
    () => {
      const id = R.liveId || liveFromStore?.liveId || liveFromStore?.id || null;
      log('🆔 resolveLiveId', {
        fromR: R.liveId,
        fromStoreLiveId: liveFromStore?.liveId,
        fromStoreId: liveFromStore?.id,
        resolved: id,
      });
      return id;
    },
    [liveFromStore, R],
  );

  const stopLiveHttpFallback = useCallback(async (id) => {
    log('🌐 stopLiveHttpFallback called', { id });
    try {
      const res = await fetch('/api/liveStream/live/stop?forceStop=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      log('🌐 stopLiveHttpFallback response', { ok: res.ok, status: res.status, json });
      return res.ok;
    } catch (e) {
      warn('🌐 stopLiveHttpFallback failed', e);
      return false;
    }
  }, []);

  const endLiveCore = useCallback(
    async ({ navigate } = { navigate: true }) => {
      dumpRuntimeFlags('🧨 endLiveCore entry');
      log('🧨 endLiveCore called', { navigate, uiSnapshot: ui });

      try {
        safeSetUI({ isEnding: true, status: 'ending' });
        R.ended = true;
        R.allowResume = false;
        R.wasPublishing = false;

        try {
          if (R.retryTimer) {
            log('🧨 clearing retryTimer in endLiveCore');
            clearTimeout(R.retryTimer);
            R.retryTimer = null;
          }
        } catch (e) {
          warn('🧨 clearTimeout retryTimer in endLiveCore failed', e);
        }

        // Minimal teardown: just stop the stream if we were publishing
        if (ui.publishing) {
          log('🧨 endLiveCore: ui.publishing=true → safeStop()');
          await safeStop();
        } else {
          log('🧨 endLiveCore: not publishing, forcing idle state');
          safeSetUI({ publishing: false, status: 'idle' });
        }

        if (ui.showCam) {
          log('🧨 endLiveCore: hiding camera');
          safeSetUI({ showCam: false });
        }

        const targetId = resolveLiveId();
        log('🧨 endLiveCore targetId resolved', targetId);

        if (targetId) {
          try {
            log('🧨 dispatch stopLiveSession', { liveId: targetId });
            await dispatch(stopLiveSession({ liveId: targetId })).unwrap();
            log('🧨 stopLiveSession thunk completed');
          } catch (e) {
            warn('🧨 stopLiveSession thunk failed', e);
          }
          try {
            log('🧨 calling stopLiveHttpFallback (1st attempt)');
            const ok = await stopLiveHttpFallback(targetId);
            if (!ok) {
              log('🧨 stopLiveHttpFallback not ok, trying again');
              await stopLiveHttpFallback(targetId);
            }
          } catch (e) {
            warn('🧨 stopLiveHttpFallback cycle failed', e);
          }
        } else {
          warn('🧨 endLiveCore: no targetId, skipping backend stop calls');
        }

        try {
          log('🧨 dispatch clearCurrentLive');
          dispatch(clearCurrentLive());
        } catch (e) {
          warn('🧨 clearCurrentLive dispatch failed', e);
        }

        const idForNav = resolveLiveId() || liveFromStore?.liveId || liveFromStore?.id;
        log('🧨 endLiveCore idForNav', idForNav);

        if (navigate && !R.unmounted && idForNav) {
          log('🧨 endLiveCore navigating to LiveSummary');
          await settleFrames(60);
          navigation.replace('LiveSummary', { liveId: idForNav, title: 'Live' });
        } else {
          log('🧨 endLiveCore: not navigating', {
            navigate,
            unmounted: R.unmounted,
            idForNav,
          });
        }
      } catch (e) {
        err('🧨 endLiveCore outer catch', e);
        try {
          Alert.alert('Stop failed', e?.message || 'Failed to stop');
        } catch (alertErr) {
          warn('🧨 Alert failed', alertErr);
        }
      }
    },
    [
      dispatch,
      navigation,
      resolveLiveId,
      stopLiveHttpFallback,
      ui.publishing,
      ui.showCam,
      liveFromStore,
      safeSetUI,
      safeStop,
      R,
      ui,
    ],
  );

  const endLive = useCallback(() => {
    log('🧨 endLive wrapper called');
    return endLiveCore({ navigate: true });
  }, [endLiveCore]);

  // Arm + countdown
  const armAndCountdown = useCallback(() => {
    log('🎬 armAndCountdown called', {
      status: ui.status,
      arming: ui.arming,
    });

    if (ui.arming || ['connecting', 'live', 'reconnecting'].includes(ui.status)) {
      warn('🎬 armAndCountdown aborted due to current state', {
        status: ui.status,
        arming: ui.arming,
      });
      return;
    }
    safeSetUI({ arming: true, status: 'arming', countdown: 3 });
  }, [ui.arming, ui.status, safeSetUI]);

  async function startLive() {
    dumpRuntimeFlags('🚦 startLive entry');
    log('🚦 startLive called', {
      status: ui.status,
      publishing: ui.publishing,
    });

    if (R.ended || R.unmounted || ui.publishing || ui.status === 'connecting' || ui.status === 'live') {
      warn('🚦 startLive abort: invalid state', {
        ended: R.ended,
        unmounted: R.unmounted,
        status: ui.status,
        publishing: ui.publishing,
      });
      return;
    }

    try {
      R.ended = false;
      R.allowResume = true;
      R.isFocused = true;
      if (R.retryTimer) {
        try {
          log('🚦 clearing retryTimer in startLive');
          clearTimeout(R.retryTimer);
        } catch (e) {
          warn('🚦 clearTimeout retryTimer in startLive failed', e);
        }
        R.retryTimer = null;
      }
      if (R.bgPaused) {
        log('🚦 startLive clearing bgPaused flag');
        R.bgPaused = false;
      }

      log('🚦 dispatch startLiveSession thunk');
      const res = await dispatch(startLiveSession()).unwrap();
      log('🚦 startLiveSession result', res);

      if (R.ended || R.unmounted) {
        warn('🚦 startLive abort after thunk: ended or unmounted');
        return;
      }

      const url = res?.rtmpUrl || liveFromStore?.rtmpUrl;
      const key = res?.streamKey || liveFromStore?.streamKey;
      const startedId = res?.liveId || res?.id || liveFromStore?.liveId || liveFromStore?.id;

      log('🚦 startLive credentials', { hasUrl: !!url, hasKey: !!key, startedId });

      if (!url || !key) throw new Error('Missing RTMP credentials');

      if (startedId) {
        R.liveId = startedId;
        if (ui.chatLiveId !== startedId) {
          log('🚦 startLive setting chatLiveId', startedId);
          safeSetUI({ chatLiveId: startedId });
        }
      }

      safeSetUI({ elapsed: 0, status: 'connecting' });

      if (R.ended || R.unmounted) {
        warn('🚦 startLive early exit after setting status: ended/unmounted');
        return;
      }

      const inst = liveRef.current;
      const isStreamingFlag =
        inst && (typeof inst.isStreaming === 'function' ? inst.isStreaming() : inst?.isStreaming);

      log('🚦 startLive liveRef.current before safeStart', {
        hasInst: !!inst,
        isStreamingFlag,
      });

      if (isStreamingFlag) {
        log('🚦 startLive: already streaming, setting live/publishing');
        safeSetUI({ status: 'live', publishing: true });
        return;
      }

      log('🚦 startLive → safeStart(...)');
      await safeStart(key, url);
    } catch (e) {
      err('🚦 startLive error', e);
      safeSetUI({ status: 'error', arming: false });
      try {
        Alert.alert('Start failed', e?.message || 'Unable to start live');
      } catch (alertErr) {
        warn('🚦 Alert failed', alertErr);
      }
    } finally {
      log('🚦 startLive finally → arming=false');
      safeSetUI({ arming: false });
    }
  }

  // AppState & focus
  const pauseForBackground = useCallback(() => {
    dumpRuntimeFlags('⏸ pauseForBackground entry');
    if (R.unmounted) {
      warn('⏸ pauseForBackground abort: unmounted');
      return;
    }
    R.wasPublishing = ui.publishing;
    if (ui.publishing) {
      log('⏸ pauseForBackground: publishing=true → bgPaused + safeStop');
      R.bgPaused = true;
      safeSetUI({ status: 'reconnecting' });
      safeStop();
    } else {
      log('⏸ pauseForBackground: not publishing, no stop');
    }
  }, [safeStop, ui.publishing, safeSetUI, R]);

  const tryResume = useCallback(
    () => {
      dumpRuntimeFlags('▶️ tryResume entry');
      log('▶️ tryResume with ui', {
        status: ui.status,
        publishing: ui.publishing,
        showCam: ui.showCam,
      });

      if (R.unmounted || R.ended) {
        warn('▶️ tryResume abort: unmounted or ended');
        return;
      }
      if (!R.allowResume || !R.isFocused || !ui.showCam) {
        warn('▶️ tryResume abort: guard failed', {
          allowResume: R.allowResume,
          isFocused: R.isFocused,
          showCam: ui.showCam,
        });
        return;
      }

      if (ui.publishing || ui.status === 'live' || ui.status === 'connecting') {
        warn('▶️ tryResume abort: already publishing/live/connecting');
        return;
      }

      const shouldResume = R.bgPaused || ui.status === 'reconnecting' || ui.status === 'error';
      log('▶️ tryResume shouldResume?', shouldResume);

      if (!shouldResume) return;

      if (R.wasPublishing && liveFromStore?.streamKey && liveFromStore?.rtmpUrl) {
        log('▶️ tryResume → safeStart with stored creds');
        safeSetUI({ status: 'reconnecting' });
        safeStart(liveFromStore.streamKey, liveFromStore.rtmpUrl);
      } else {
        warn('▶️ tryResume abort: no creds or wasPublishing=false');
      }
    },
    [liveFromStore, safeStart, ui.publishing, ui.showCam, ui.status, safeSetUI, R],
  );

  useEffect(() => {
    log('📱 AppState subscription setup');
    const handler = (s) => {
      log('📱 AppState change', s);
      if (s === 'active') tryResume();
      else if (s === 'background') pauseForBackground();
    };

    const sub = AppState.addEventListener('change', handler);

    return () => {
      log('📱 AppState cleanup');
      try {
        if (sub && typeof sub.remove === 'function') {
          sub.remove();
        } else if (AppState.removeEventListener) {
          AppState.removeEventListener('change', handler);
        }
      } catch (e) {
        warn('📱 AppState cleanup failed', e);
      }
    };
  }, [pauseForBackground, tryResume]);

  useFocusEffect(
    useCallback(() => {
      log('🎯 useFocusEffect → focused');
      dumpRuntimeFlags('🎯 before focus');
      R.isFocused = true;
      R.allowResume = true;

      if (R.bgPaused || ui.status === 'reconnecting' || ui.status === 'error') {
        log('🎯 useFocusEffect: trying resume due to bgPaused/reconnecting/error');
        tryResume();
      }

      return () => {
        log('🎯 useFocusEffect cleanup → blurred');
        dumpRuntimeFlags('🎯 before blur cleanup');
        R.isFocused = false;
        R.allowResume = false;
        if (ui.publishing) {
          log('🎯 blur cleanup: publishing=true → safeStop()');
          safeStop();
        } else {
          log('🎯 blur cleanup: not publishing, no stop');
        }
      };
    }, [safeStop, tryResume, ui.publishing, ui.status, R]),
  );

  // Unmount cleanup – **no explicit destroy/stop here**, just flags + timers
  useEffect(() => {
    log('🧹 unmount cleanup effect registered');
    return () => {
      log('🧹 unmount cleanup fired');
      dumpRuntimeFlags('🧹 before unmount');
      R.unmounted = true;
      try {
        if (R.retryTimer) {
          log('🧹 clearing retryTimer on unmount');
          clearTimeout(R.retryTimer);
          R.retryTimer = null;
        }
      } catch (e) {
        warn('🧹 clearTimeout retryTimer in unmount failed', e);
      }
    };
  }, [R]);

  // Public API
  const api = {
    ui,
    setUI,
    actions: {
      flip: () => {
        log('🔁 actions.flip called', { currentFront: ui.front });
        safeSetUI({ front: !ui.front });
      },
      armAndCountdown,
      endLive,
      retry: () => {
        log('🔁 actions.retry called');
        safeSetUI({ status: 'idle' });
        armAndCountdown();
      },
      onClosePress: () => {
        log('⏹ actions.onClosePress called', {
          status: ui.status,
          publishing: ui.publishing,
        });
        if (ui.status === 'live' || ui.status === 'reconnecting' || ui.publishing) {
          log('⏹ onClosePress → endLive() path');
          safeSetUI({ isEnding: true, status: 'ending' });
          endLive();
        } else {
          log('⏹ onClosePress → lightweight goBack path');
          (async () => {
            safeSetUI({ isEnding: true, status: 'ending' });
            try {
              log('⏹ onClosePress → dispatch clearCurrentLive');
              dispatch(clearCurrentLive());
            } catch (e) {
              warn('⏹ clearCurrentLive in onClosePress failed', e);
            }
            await settleFrames(60);
            if (!R.unmounted) {
              log('⏹ onClosePress → navigation.goBack()');
              navigation.goBack();
            } else {
              warn('⏹ onClosePress: unmounted before goBack, skipping');
            }
          })();
        }
      },
      onConnectionSuccess: () => {
        log('✅ actions.onConnectionSuccess called');
        dumpRuntimeFlags('✅ onConnectionSuccess');
        if (R.unmounted || R.ended) {
          warn('✅ onConnectionSuccess abort: unmounted or ended');
          return;
        }
        safeSetUI({ publishing: true, status: 'live' });
        R.wasPublishing = true;
        R.bgPaused = false;
        try {
          if (R.retryTimer) {
            log('✅ clearing retryTimer on success');
            clearTimeout(R.retryTimer);
            R.retryTimer = null;
          }
        } catch (e) {
          warn('✅ clearTimeout retryTimer in onConnectionSuccess failed', e);
        }
      },
      onConnectionFailed: () => {
        log('❌ actions.onConnectionFailed called');
        dumpRuntimeFlags('❌ onConnectionFailed');
        if (R.unmounted || R.ended) {
          warn('❌ onConnectionFailed abort: unmounted or ended');
          return;
        }
        safeSetUI({ publishing: false, status: 'error' });
        scheduleRetry();
      },
      onDisconnect: () => {
        log('🔌 actions.onDisconnect called');
        dumpRuntimeFlags('🔌 onDisconnect');
        if (R.unmounted || R.ended) {
          warn('🔌 onDisconnect abort: unmounted or ended');
          return;
        }
        safeSetUI({
          publishing: false,
          status: R.wasPublishing ? 'reconnecting' : 'error',
        });
        scheduleRetry();
      },
    },
  };

  log('🏁 usePublisher return snapshot', {
    ui,
    actionsKeys: Object.keys(api.actions),
  });

  return api;
}
