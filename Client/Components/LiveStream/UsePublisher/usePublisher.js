import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState, Alert } from 'react-native';
import { useDispatch } from 'react-redux';
import inCallManager from 'react-native-incall-manager';
import {
    startLiveSession,
    stopLiveSession,
    clearCurrentLive,
} from '../../../Slices/LiveStreamSlice';
import { deactivateExpoAudio, tick, resetTick } from '../../../utils/LiveStream/deactivateAudio';
import { useFocusEffect } from '@react-navigation/native';

const settleFrames = async (ms = 120) => {
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, ms));
};

const initialUI = {
    showCam: true,
    front: true,
    arming: false,
    countdown: 0,
    isEnding: false,
    showChat: true,
    status: 'idle',         // 'idle'|'arming'|'connecting'|'live'|'reconnecting'|'ending'|'error'
    publishing: false,
    elapsed: 0,
    chatLiveId: null,
};

function uiReducer(state, action) {
    switch (action.type) {
        case 'SET': return { ...state, ...action.patch };
        case 'INC_ELAPSED': return { ...state, elapsed: state.elapsed + 1 };
        case 'DEC_COUNTDOWN': return { ...state, countdown: Math.max(0, state.countdown - 1) };
        default: return state;
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


    const ensureAudioOff = useCallback(async () => {
        if (R.audioDisabled) return;
        try { await deactivateExpoAudio(); R.audioDisabled = true; } catch { }
    }, []);

    // Keep durable live id and chat id synced
    useEffect(() => {
        const id = liveFromStore?.liveId || liveFromStore?.id;
        if (id) { R.liveId = id; setUI({ type: 'SET', patch: { chatLiveId: id } }); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveFromStore?.liveId, liveFromStore?.id]);

    // Elapsed timer
    useEffect(() => {
        let t; if (ui.publishing) t = setInterval(() => setUI({ type: 'INC_ELAPSED' }), 1000);
        return () => clearInterval(t);
    }, [ui.publishing]);

    // Countdown
    useEffect(() => {
        let t;
        if (ui.arming && ui.countdown > 0) {
            t = setInterval(() => setUI({ type: 'DEC_COUNTDOWN' }), 1000);
        } else if (ui.arming && ui.countdown === 0) {
            startLive();
        }
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ui.arming, ui.countdown]);

    const withOpLock = useCallback(async (fn) => {
        if (R.opLock) return;
        R.opLock = true;
        try { await fn(); } finally { R.opLock = false; }
    }, []);

    const safeStart = useCallback((key, url) => withOpLock(async () => {
        if (R.ended || !R.allowResume || !R.isFocused || !ui.showCam || !key || !url) return;

        // if the view exposes an isStreaming flag, guard here
        if (liveRef.current?.isStreaming) return;

        try { await liveRef.current?.startStreaming?.(key, url); } catch { }
        setUI({ type: 'SET', patch: { status: ui.status === 'reconnecting' ? 'reconnecting' : 'connecting' } });
    }), [liveRef, ui.showCam, ui.status, withOpLock]);

    const safeStop = useCallback(() => withOpLock(async () => {
        try { await liveRef.current?.stopStreaming?.(); } catch { }
        setUI({ type: 'SET', patch: { publishing: false, status: 'idle' } });
    }), [liveRef, withOpLock]);

    const scheduleRetry = useCallback(() => {
        if (R.ended || !R.allowResume || R.retryTimer || !ui.showCam) return;
        // don't retry if we're already live/connecting/publishing
        if (ui.publishing || ui.status === 'live' || ui.status === 'connecting') return;

        R.retryTimer = setTimeout(() => {
            R.retryTimer = null;
            if (R.wasPublishing && liveFromStore?.streamKey && liveFromStore?.rtmpUrl) {
                setUI({ type: 'SET', patch: { status: 'reconnecting' } });
                safeStart(liveFromStore.streamKey, liveFromStore.rtmpUrl);
            }
        }, 900);
    }, [liveFromStore, safeStart, ui.publishing, ui.showCam, ui.status]);

    const stopPublisherSafe = useCallback(async () => {
        const timeout = new Promise(r => setTimeout(r, 1500));
        const stop = (async () => { try { await liveRef.current?.stopStreaming?.(); } catch { } })();
        await Promise.race([timeout, stop]);
    }, [liveRef]);

    const stopPreviewSafe = useCallback(async () => { try { await liveRef.current?.stopPreview?.(); } catch { } }, [liveRef]);

    const stopOSAudioSession = useCallback(() => {
        try {
            inCallManager.stop();
            inCallManager.setSpeakerphoneOn?.(false);
            inCallManager.setForceSpeakerphoneOn?.(false);
            inCallManager.stopProximitySensor?.();
        } catch { }
    }, []);

    const releaseHardware = useCallback(async () => {
        resetTick();
        R.ended = true; R.allowResume = false; R.wasPublishing = false;
        try { clearTimeout(R.retryTimer); R.retryTimer = null; } catch { }

        await stopPublisherSafe();
        await stopPreviewSafe();
        stopOSAudioSession();
        await ensureAudioOff();

        setUI({ type: 'SET', patch: { publishing: false, status: 'idle' } });
        await settleFrames(160);

        try { await liveRef.current?.destroy?.(); } catch { }
        liveRef.current = null;
    }, [ensureAudioOff, liveRef, stopOSAudioSession, stopPreviewSafe, stopPublisherSafe]);

    const resolveLiveId = useCallback(() => R.liveId || liveFromStore?.liveId || liveFromStore?.id || null, [liveFromStore]);

    const stopLiveHttpFallback = useCallback(async (id) => {
        try {
            const res = await fetch('/api/liveStream/live/stop?forceStop=true', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            await res.json().catch(() => ({}));
            return res.ok;
        } catch { return false; }
    }, []);

    const endLiveCore = useCallback(async ({ navigate } = { navigate: true }) => {
        try {
            setUI({ type: 'SET', patch: { isEnding: true, status: 'ending' } });
            R.ended = true; R.allowResume = false; R.wasPublishing = false;
            try { clearTimeout(R.retryTimer); R.retryTimer = null; } catch { }

            await releaseHardware();
            if (ui.showCam) setUI({ type: 'SET', patch: { showCam: false } });

            const targetId = resolveLiveId();
            if (targetId) {
                try { await dispatch(stopLiveSession({ liveId: targetId })).unwrap(); } catch { }
                try {
                    const ok = await stopLiveHttpFallback(targetId);
                    if (!ok) await stopLiveHttpFallback(targetId);
                } catch { }
            }

            try { dispatch(clearCurrentLive()); } catch { }

            const idForNav =
                resolveLiveId() ||
                liveFromStore?.liveId ||
                liveFromStore?.id;

            if (navigate && !R.unmounted && idForNav) {
                await settleFrames(60);
                navigation.replace('LiveSummary', { liveId: idForNav, title: 'Live' });
            }
        } catch (e) {
            Alert.alert('Stop failed', e?.message || 'Failed to stop');
        }
    }, [dispatch, navigation, releaseHardware, resolveLiveId, stopLiveHttpFallback, ui.showCam]);

    const endLive = useCallback(() => endLiveCore({ navigate: true }), [endLiveCore]);

    // Arm + countdown
    const armAndCountdown = useCallback(() => {
        if (ui.arming || ['connecting', 'live', 'reconnecting'].includes(ui.status)) return;
        setUI({ type: 'SET', patch: { arming: true, status: 'arming', countdown: 3 } });
    }, [ui.arming, ui.status]);

    async function startLive() {
        // hard guards to avoid double-starts or zombie starts
        if (R.ended || R.unmounted || ui.publishing || ui.status === 'connecting' || ui.status === 'live') return;

        try {
            // we intend to stream now
            R.ended = false;
            R.allowResume = true;
            R.isFocused = true;
            if (R.retryTimer) { try { clearTimeout(R.retryTimer); } catch { } R.retryTimer = null; }
            if (R.bgPaused) R.bgPaused = false; // if you're using the bgPaused flag

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
                    setUI({ type: 'SET', patch: { chatLiveId: startedId } });
                }
            }

            setUI({ type: 'SET', patch: { elapsed: 0, status: 'connecting' } });

            // One more quick guard right before the SDK call
            if (R.ended || R.unmounted) return;

            // Avoid redundant start if SDK exposes a flag
            if (liveRef.current?.isStreaming) {
                // we're already live; reflect state just in case
                setUI({ type: 'SET', patch: { status: 'live', publishing: true } });
                return;
            }

            await safeStart(key, url);
        } catch (e) {
            setUI({ type: 'SET', patch: { status: 'error', arming: false } });
            Alert.alert('Start failed', e?.message || 'Unable to start live');
        } finally {
            setUI({ type: 'SET', patch: { arming: false } });
        }
    }


    // AppState & focus
    const pauseForBackground = useCallback(() => {
        R.wasPublishing = ui.publishing;
        if (ui.publishing) {
            R.bgPaused = true;                     // <— mark we intentionally paused
            setUI({ type: 'SET', patch: { status: 'reconnecting' } });
            safeStop();
        }
    }, [safeStop, ui.publishing]);

    const tryResume = useCallback(() => {
        if (R.ended || !R.allowResume || !R.isFocused || !ui.showCam) return;

        // hard guards: don't resume if already live/connecting/publishing
        if (ui.publishing || ui.status === 'live' || ui.status === 'connecting') return;

        // only resume if we had paused OR we're explicitly in a reconnectable state
        const shouldResume = R.bgPaused || ui.status === 'reconnecting' || ui.status === 'error';
        if (!shouldResume) return;

        if (R.wasPublishing && liveFromStore?.streamKey && liveFromStore?.rtmpUrl) {
            setUI({ type: 'SET', patch: { status: 'reconnecting' } });
            safeStart(liveFromStore.streamKey, liveFromStore.rtmpUrl);
        }
    }, [liveFromStore, safeStart, ui.publishing, ui.showCam, ui.status]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => {
            if (s === 'active') tryResume();
            else if (s === 'background') pauseForBackground();
        });
        return () => sub.remove();
    }, [pauseForBackground, tryResume]);

    useFocusEffect(useCallback(() => {
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
    }, [safeStop, tryResume, ui.publishing, ui.status]));

    // Transition cleanup
    useEffect(() => {
        const offEnd = navigation.addListener('transitionEnd', ({ data }) => {
            if (data?.closing) {
                (async () => {
                    try { await stopPublisherSafe(); } catch { }
                    try { inCallManager.stop(); } catch { }
                    await ensureAudioOff();
                })();
            }
        });
        return () => offEnd();
    }, [navigation, ensureAudioOff, stopPublisherSafe]);

    // Unmount cleanup
    useEffect(() => {
        return () => {
            R.unmounted = true;
            try { clearTimeout(R.retryTimer); } catch { }
            (async () => {
                try { await liveRef.current?.stopStreaming?.(); } catch { }
                await ensureAudioOff();
            })();
            if (ui.showCam) setUI({ type: 'SET', patch: { showCam: false } });
            try { inCallManager.stop(); } catch { }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Public API
    return {
        ui,
        setUI,
        actions: {
            flip: () => setUI({ type: 'SET', patch: { front: !ui.front } }),
            armAndCountdown,
            endLive,
            retry: () => { setUI({ type: 'SET', patch: { status: 'idle' } }); armAndCountdown(); },
            onClosePress: () => {
                if (ui.status === 'live' || ui.status === 'reconnecting' || ui.publishing) {
                    setUI({ type: 'SET', patch: { isEnding: true, status: 'ending' } });
                    endLive();
                } else {
                    (async () => {
                        setUI({ type: 'SET', patch: { isEnding: true, status: 'ending' } });
                        await releaseHardware();
                        dispatch(clearCurrentLive());
                        await settleFrames(60);
                        navigation.goBack();
                    })();
                }
            },
            onConnectionSuccess: () => {
                setUI({ type: 'SET', patch: { publishing: true, status: 'live' } });
                R.wasPublishing = true;
                R.bgPaused = false;                      // <— clear after successful resume
                try { clearTimeout(R.retryTimer); R.retryTimer = null; } catch { }
            },
            onConnectionFailed: () => { if (!R.ended) { setUI({ type: 'SET', patch: { publishing: false, status: 'error' } }); scheduleRetry(); } },
            onDisconnect: () => { if (!R.ended) { setUI({ type: 'SET', patch: { publishing: false, status: R.wasPublishing ? 'reconnecting' : 'error' } }); scheduleRetry(); } },
        },
    };
}
