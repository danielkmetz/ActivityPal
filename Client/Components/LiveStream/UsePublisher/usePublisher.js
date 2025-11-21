import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState, Alert } from 'react-native';
import { useDispatch } from 'react-redux';
import inCallManager from 'react-native-incall-manager';
import {
  startLiveSession,
  stopLiveSession,
  clearCurrentLive,
} from '../../../Slices/LiveStreamSlice';
import {
  deactivateExpoAudio,
  tick, // kept in case you use it later
  resetTick,
} from '../../../utils/LiveStream/deactivateAudio';
import { useFocusEffect } from '@react-navigation/native';

const TAG = '[usePublisher]';

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
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.patch };
    case 'INC_ELAPSED':
      return { ...state, elapsed: state.elapsed + 1 };
    case 'DEC_COUNTDOWN':
      return { ...state, countdown: Math.max(0, state.countdown - 1) };
    default:
      return state;
  }
}

export function usePublisher({ liveRef, navigation, liveFromStore }) {
  const dispatch = useDispatch();
  const [ui, setUI] = useReducer(uiReducer, initialUI);

  // Imperative runtime flags
  const R = useRef({
    ended: false,
    allowResume: true,
    wasPublishing: false,
    isFocused: false,
    retryTimer: null,
    unmounted: false,
    opLock: false,
    liveId: null,
    audioDisabled: false,
    bgPaused: false,
  }).current;

  const safeSetUI = useCallback(
    (patch) => {
      if (R.unmounted) return;
      setUI({ type: 'SET', patch });
    },
    [R],
  );

  const ensureAudioOff = useCallback(async () => {
    if (R.audioDisabled) return;
    try {
      await deactivateExpoAudio();
      R.audioDisabled = true;
    } catch (e) {
      console.warn(TAG, 'deactivateExpoAudio failed', e);
    }
  }, [R]);

  // Keep durable live id and chat id synced
  useEffect(() => {
    const id = liveFromStore?.liveId || liveFromStore?.id;
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
      t = setInterval(() => {
        if (!R.unmounted) {
          setUI({ type: 'INC_ELAPSED' });
        }
      }, 1000);
    }
    return () => {
      if (t) clearInterval(t);
    };
  }, [ui.publishing, R]);

  // Countdown
  useEffect(() => {
    let t;
    if (ui.arming && ui.countdown > 0) {
      t = setInterval(() => {
        if (!R.unmounted) {
          setUI({ type: 'DEC_COUNTDOWN' });
        }
      }, 1000);
    } else if (ui.arming && ui.countdown === 0) {
      // guard startLive so it can't run after unmount
      if (!R.unmounted) {
        startLive();
      }
    }
    return () => {
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.arming, ui.countdown, R]);

  const withOpLock = useCallback(
    async (fn) => {
      if (R.opLock) return;
      R.opLock = true;
      try {
        await fn();
      } catch (e) {
        console.warn(TAG, 'withOpLock fn threw', e);
      } finally {
        R.opLock = false;
      }
    },
    [R],
  );

  const safeStart = useCallback(
    (key, url) =>
      withOpLock(async () => {
        if (R.unmounted) return;
        if (R.ended || !R.allowResume || !R.isFocused || !ui.showCam || !key) return;

        const inst = liveRef.current;
        if (!inst || typeof inst.startStreaming !== 'function') {
          console.warn(TAG, 'startStreaming not available yet', { inst });
          return;
        }

        // optional: if plugin ever exposes it as a function, handle that:
        const isStreamingFlag =
          typeof inst.isStreaming === 'function' ? inst.isStreaming() : inst.isStreaming;

        if (isStreamingFlag) return;

        try {
          await inst.startStreaming(key, url);
          safeSetUI({
            status: ui.status === 'reconnecting' ? 'reconnecting' : 'connecting',
          });
        } catch (e) {
          console.warn(TAG, 'startStreaming threw', e);
          // don't rethrow; keep JS from blowing up callbacks
        }
      }),
    [liveRef, R, ui.showCam, ui.status, withOpLock, safeSetUI],
  );

  const safeStop = useCallback(
    () =>
      withOpLock(async () => {
        if (R.unmounted) return;
        const inst = liveRef.current;
        if (!inst || typeof inst.stopStreaming !== 'function') {
          console.warn(TAG, 'stopStreaming not available', { inst });
          safeSetUI({ publishing: false, status: 'idle' });
          return;
        }

        try {
          await inst.stopStreaming();
        } catch (e) {
          console.warn(TAG, 'stopStreaming threw', e);
        }
        safeSetUI({ publishing: false, status: 'idle' });
      }),
    [liveRef, withOpLock, safeSetUI, R],
  );

  const scheduleRetry = useCallback(
    () => {
      if (R.unmounted) return;
      if (R.ended || !R.allowResume || R.retryTimer || !ui.showCam) return;
      // don't retry if we're already live/connecting/publishing
      if (ui.publishing || ui.status === 'live' || ui.status === 'connecting') return;

      R.retryTimer = setTimeout(() => {
        if (R.unmounted) return;
        R.retryTimer = null;
        if (R.wasPublishing && liveFromStore?.streamKey && liveFromStore?.rtmpUrl) {
          safeSetUI({ status: 'reconnecting' });
          safeStart(liveFromStore.streamKey, liveFromStore.rtmpUrl);
        }
      }, 900);
    },
    [liveFromStore, safeStart, ui.publishing, ui.showCam, ui.status, R, safeSetUI],
  );

  const stopPublisherSafe = useCallback(
    async () => {
      const timeout = new Promise((r) => setTimeout(r, 1500));
      const stop = (async () => {
        try {
          const inst = liveRef.current;
          if (inst && typeof inst.stopStreaming === 'function') {
            await inst.stopStreaming();
          }
        } catch (e) {
          console.warn(TAG, 'stopPublisherSafe stopStreaming threw', e);
        }
      })();
      await Promise.race([timeout, stop]);
    },
    [liveRef],
  );

  const stopPreviewSafe = useCallback(async () => {
    try {
      const inst = liveRef.current;
      if (inst && typeof inst.stopPreview === 'function') {
        await inst.stopPreview();
      }
    } catch (e) {
      console.warn(TAG, 'stopPreviewSafe threw', e);
    }
  }, [liveRef]);

  const stopOSAudioSession = useCallback(() => {
    try {
      inCallManager.stop();
      inCallManager.setSpeakerphoneOn?.(false);
      inCallManager.setForceSpeakerphoneOn?.(false);
      inCallManager.stopProximitySensor?.();
    } catch (e) {
      console.warn(TAG, 'stopOSAudioSession failed', e);
    }
  }, []);

  const releaseHardware = useCallback(
    async () => {
      resetTick();
      R.ended = true;
      R.allowResume = false;
      R.wasPublishing = false;
      try {
        if (R.retryTimer) {
          clearTimeout(R.retryTimer);
          R.retryTimer = null;
        }
      } catch (e) {
        console.warn(TAG, 'clearTimeout retryTimer failed', e);
      }

      await stopPublisherSafe();
      await stopPreviewSafe();
      stopOSAudioSession();
      await ensureAudioOff();

      safeSetUI({ publishing: false, status: 'idle' });
      await settleFrames(160);

      try {
        const inst = liveRef.current;
        if (inst && typeof inst.destroy === 'function') {
          await inst.destroy();
        }
      } catch (e) {
        console.warn(TAG, 'destroy threw', e);
      }
      liveRef.current = null;
    },
    [ensureAudioOff, liveRef, stopOSAudioSession, stopPreviewSafe, stopPublisherSafe, safeSetUI, R],
  );

  const resolveLiveId = useCallback(
    () => R.liveId || liveFromStore?.liveId || liveFromStore?.id || null,
    [liveFromStore, R],
  );

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
      console.warn(TAG, 'stopLiveHttpFallback failed', e);
      return false;
    }
  }, []);

  const endLiveCore = useCallback(
    async ({ navigate } = { navigate: true }) => {
      try {
        safeSetUI({ isEnding: true, status: 'ending' });
        R.ended = true;
        R.allowResume = false;
        R.wasPublishing = false;
        try {
          if (R.retryTimer) {
            clearTimeout(R.retryTimer);
            R.retryTimer = null;
          }
        } catch (e) {
          console.warn(TAG, 'clearTimeout retryTimer in endLiveCore failed', e);
        }

        await releaseHardware();
        if (ui.showCam) safeSetUI({ showCam: false });

        const targetId = resolveLiveId();
        if (targetId) {
          try {
            await dispatch(stopLiveSession({ liveId: targetId })).unwrap();
          } catch (e) {
            console.warn(TAG, 'stopLiveSession thunk failed', e);
          }
          try {
            const ok = await stopLiveHttpFallback(targetId);
            if (!ok) await stopLiveHttpFallback(targetId);
          } catch (e) {
            console.warn(TAG, 'stopLiveHttpFallback cycle failed', e);
          }
        }

        try {
          dispatch(clearCurrentLive());
        } catch (e) {
          console.warn(TAG, 'clearCurrentLive dispatch failed', e);
        }

        const idForNav = resolveLiveId() || liveFromStore?.liveId || liveFromStore?.id;

        if (navigate && !R.unmounted && idForNav) {
          await settleFrames(60);
          navigation.replace('LiveSummary', { liveId: idForNav, title: 'Live' });
        }
      } catch (e) {
        try {
          Alert.alert('Stop failed', e?.message || 'Failed to stop');
        } catch (alertErr) {
          console.warn(TAG, 'Alert failed', alertErr);
        }
      }
    },
    [
      dispatch,
      navigation,
      releaseHardware,
      resolveLiveId,
      stopLiveHttpFallback,
      ui.showCam,
      liveFromStore,
      safeSetUI,
      R,
    ],
  );

  const endLive = useCallback(() => endLiveCore({ navigate: true }), [endLiveCore]);

  // Arm + countdown
  const armAndCountdown = useCallback(() => {
    if (ui.arming || ['connecting', 'live', 'reconnecting'].includes(ui.status)) return;
    safeSetUI({ arming: true, status: 'arming', countdown: 3 });
  }, [ui.arming, ui.status, safeSetUI]);

  async function startLive() {
    // hard guards to avoid double-starts or zombie starts
    if (R.ended || R.unmounted || ui.publishing || ui.status === 'connecting' || ui.status === 'live') {
      return;
    }

    try {
      // we intend to stream now
      R.ended = false;
      R.allowResume = true;
      R.isFocused = true;
      if (R.retryTimer) {
        try {
          clearTimeout(R.retryTimer);
        } catch (e) {
          console.warn(TAG, 'clearTimeout retryTimer in startLive failed', e);
        }
        R.retryTimer = null;
      }
      if (R.bgPaused) R.bgPaused = false;

      const res = await dispatch(startLiveSession()).unwrap();

      // After awaiting, re-check that we still should proceed
      if (R.ended || R.unmounted) return;

      const url = res?.rtmpUrl || liveFromStore?.rtmpUrl;
      const key = res?.streamKey || liveFromStore?.streamKey;
      const startedId = res?.liveId || res?.id || liveFromStore?.liveId || liveFromStore?.id;

      if (!url || !key) throw new Error('Missing RTMP credentials');

      // Track the durable id and wire chat before we actually start
      if (startedId) {
        R.liveId = startedId;
        if (ui.chatLiveId !== startedId) {
          safeSetUI({ chatLiveId: startedId });
        }
      }

      safeSetUI({ elapsed: 0, status: 'connecting' });

      // One more quick guard right before the SDK call
      if (R.ended || R.unmounted) return;

      // Avoid redundant start if SDK exposes a flag
      const inst = liveRef.current;
      const isStreamingFlag =
        inst && (typeof inst.isStreaming === 'function' ? inst.isStreaming() : inst?.isStreaming);

      if (isStreamingFlag) {
        safeSetUI({ status: 'live', publishing: true });
        return;
      }

      await safeStart(key, url);
    } catch (e) {
      safeSetUI({ status: 'error', arming: false });
      try {
        Alert.alert('Start failed', e?.message || 'Unable to start live');
      } catch (alertErr) {
        console.warn(TAG, 'Alert failed', alertErr);
      }
    } finally {
      safeSetUI({ arming: false });
    }
  }

  // AppState & focus
  const pauseForBackground = useCallback(() => {
    if (R.unmounted) return;
    R.wasPublishing = ui.publishing;
    if (ui.publishing) {
      R.bgPaused = true;
      safeSetUI({ status: 'reconnecting' });
      safeStop();
    }
  }, [safeStop, ui.publishing, safeSetUI, R]);

  const tryResume = useCallback(
    () => {
      if (R.unmounted) return;
      if (R.ended || !R.allowResume || !R.isFocused || !ui.showCam) return;

      // hard guards: don't resume if already live/connecting/publishing
      if (ui.publishing || ui.status === 'live' || ui.status === 'connecting') return;

      // only resume if we had paused OR we're explicitly in a reconnectable state
      const shouldResume = R.bgPaused || ui.status === 'reconnecting' || ui.status === 'error';
      if (!shouldResume) return;

      if (R.wasPublishing && liveFromStore?.streamKey && liveFromStore?.rtmpUrl) {
        safeSetUI({ status: 'reconnecting' });
        safeStart(liveFromStore.streamKey, liveFromStore.rtmpUrl);
      }
    },
    [liveFromStore, safeStart, ui.publishing, ui.showCam, ui.status, safeSetUI, R],
  );

  useEffect(() => {
    const handler = (s) => {
      if (s === 'active') tryResume();
      else if (s === 'background') pauseForBackground();
    };

    const sub = AppState.addEventListener('change', handler);

    return () => {
      try {
        if (sub && typeof sub.remove === 'function') {
          sub.remove();
        } else if (AppState.removeEventListener) {
          AppState.removeEventListener('change', handler);
        }
      } catch (e) {
        console.warn(TAG, 'AppState cleanup failed', e);
      }
    };
  }, [pauseForBackground, tryResume]);

  useFocusEffect(
    useCallback(() => {
      R.isFocused = true;
      R.allowResume = true;

      // only attempt resume if we actually paused or are reconnecting/error
      if (R.bgPaused || ui.status === 'reconnecting' || ui.status === 'error') {
        tryResume();
      }

      return () => {
        R.isFocused = false;
        R.allowResume = false;
        if (ui.publishing) safeStop();
      };
    }, [safeStop, tryResume, ui.publishing, ui.status, R]),
  );

  // Transition cleanup
  useEffect(() => {
    const offEnd = navigation.addListener('transitionEnd', ({ data }) => {
      if (data?.closing) {
        (async () => {
          try {
            await stopPublisherSafe();
          } catch (e) {
            console.warn(TAG, 'stopPublisherSafe in transitionEnd failed', e);
          }
          try {
            inCallManager.stop();
          } catch (e) {
            console.warn(TAG, 'inCallManager.stop in transitionEnd failed', e);
          }
          await ensureAudioOff();
        })();
      }
    });
    return () => {
      try {
        offEnd();
      } catch (e) {
        console.warn(TAG, 'transitionEnd cleanup failed', e);
      }
    };
  }, [navigation, ensureAudioOff, stopPublisherSafe]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      R.unmounted = true;
      try {
        if (R.retryTimer) {
          clearTimeout(R.retryTimer);
          R.retryTimer = null;
        }
      } catch (e) {
        console.warn(TAG, 'clearTimeout retryTimer in unmount failed', e);
      }

      (async () => {
        try {
          const inst = liveRef.current;
          if (inst && typeof inst.stopStreaming === 'function') {
            await inst.stopStreaming();
          }
        } catch (e) {
          console.warn(TAG, 'stopStreaming in unmount failed', e);
        }
        await ensureAudioOff();
      })();

      try {
        inCallManager.stop();
      } catch (e) {
        console.warn(TAG, 'inCallManager.stop in unmount failed', e);
      }
      // No setUI here → avoid state updates after unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Public API
  return {
    ui,
    setUI, // expose raw reducer for rare advanced usage if needed
    actions: {
      flip: () => safeSetUI({ front: !ui.front }),
      armAndCountdown,
      endLive,
      retry: () => {
        safeSetUI({ status: 'idle' });
        armAndCountdown();
      },
      onClosePress: () => {
        if (ui.status === 'live' || ui.status === 'reconnecting' || ui.publishing) {
          safeSetUI({ isEnding: true, status: 'ending' });
          endLive();
        } else {
          (async () => {
            safeSetUI({ isEnding: true, status: 'ending' });
            await releaseHardware();
            try {
              dispatch(clearCurrentLive());
            } catch (e) {
              console.warn(TAG, 'clearCurrentLive in onClosePress failed', e);
            }
            await settleFrames(60);
            if (!R.unmounted) {
              navigation.goBack();
            }
          })();
        }
      },
      onConnectionSuccess: () => {
        if (R.unmounted) return;
        safeSetUI({ publishing: true, status: 'live' });
        R.wasPublishing = true;
        R.bgPaused = false;
        try {
          if (R.retryTimer) {
            clearTimeout(R.retryTimer);
            R.retryTimer = null;
          }
        } catch (e) {
          console.warn(TAG, 'clearTimeout retryTimer in onConnectionSuccess failed', e);
        }
      },
      onConnectionFailed: () => {
        if (R.unmounted || R.ended) return;
        safeSetUI({ publishing: false, status: 'error' });
        scheduleRetry();
      },
      onDisconnect: () => {
        if (R.unmounted || R.ended) return;
        safeSetUI({
          publishing: false,
          status: R.wasPublishing ? 'reconnecting' : 'error',
        });
        scheduleRetry();
      },
    },
  };
}
