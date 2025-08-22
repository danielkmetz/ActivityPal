import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { ApiVideoLiveStreamView } from '@api.video/react-native-livestream';

const RTMP_URL = 'YOUR_RTMP_URL_HERE';
const STREAM_KEY = 'YOUR_STREAM_KEY_HERE';

export default function GoLiveTest() {
  const liveRef = useRef(null);
  const [showPreview, setShowPreview] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [front, setFront] = useState(true);
  const [previewKey, setPreviewKey] = useState(() => Math.random().toString(36).slice(2));

  const L = (...args) => console.log('[SimpleLiveStopTest]', ...args);

  // OPTIONAL: when preview is about to be (re)mounted, give it a fresh key
  const remountPreview = useCallback(() => {
    setPreviewKey(Math.random().toString(36).slice(2));
    setShowPreview(true);
  }, []);

  useEffect(() => {
    const wrap = (name) => {
      const fn = liveRef.current?.[name];
      if (!fn) { L(`[REF] ${name} not present`); return; }
      liveRef.current[name] = async (...args) => {
        L(`[REF] ${name} CALL →`, args);
        const t0 = Date.now();
        try {
          const res = await fn.apply(liveRef.current, args);
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
      wrap('startStreaming');
      wrap('stopStreaming');
      wrap('stopPreview');
      wrap('destroy');
      wrap('release');
    } else {
      L('[REF] liveRef.current is null at wrap time');
    }
  }, [showPreview]); // re-wrap only when preview mounts

  const start = useCallback(async () => {
    try {
      if (!STREAM_KEY || !RTMP_URL) {
        L('Missing RTMP creds; set RTMP_URL and STREAM_KEY at top of file.');
        return;
      }
      L('START call');
      await liveRef.current?.startStreaming?.(STREAM_KEY, RTMP_URL);
    } catch (e) {
      L('START error', e?.message || e);
    }
  }, []);

  const stop = useCallback(async () => {
    try { L('STOP call'); await liveRef.current?.stopStreaming?.(); } catch {}
    setShowPreview(false);              // unmount to ensure camera releases
    setTimeout(() => (liveRef.current = null), 0);
  }, []);

  return (
    <View style={S.container}>
      {/* badges */}
      <View style={S.statusRow}>
        <Badge label={`preview=${String(showPreview)}`} />
        <Badge label={`streaming=${String(streaming)}`} />
        <Badge label={`camera=${front ? 'front' : 'back'}`} />
        <Badge label={`platform=${Platform.OS}`} />
      </View>

      {showPreview ? (
        <View style={S.preview}>
          <ApiVideoLiveStreamView
            key={previewKey}              // ✅ only changes when you call remountPreview()
            ref={liveRef}
            style={S.preview}
            camera={front ? 'front' : 'back'}
            video={{ fps: 30, resolution: '720p', bitrate: 1.5 * 1024 * 1024, gopDuration: 2 }}
            audio={{ bitrate: 128000, sampleRate: 44100, isStereo: true }}
            isMuted={false}
            onConnectionSuccess={() => { L('onConnectionSuccess'); setStreaming(true); }}
            onConnectionFailed={(code) => { L('onConnectionFailed', code); setStreaming(false); }}
            onDisconnect={() => { L('onDisconnect'); setStreaming(false); }}
          />
        </View>
      ) : (
        <View style={[S.preview, S.previewOff]}>
          <Text style={{ color: '#999' }}>Preview unmounted</Text>
        </View>
      )}

      <View style={S.controls}>
        <Pressable style={[S.btn, S.go]} onPress={start}><Text style={S.btnTxt}>Start</Text></Pressable>
        <Pressable style={[S.btn, S.stop]} onPress={stop}><Text style={S.btnTxt}>Stop</Text></Pressable>

        {/* Toggle mount/unmount */}
        {showPreview ? (
          <Pressable style={S.btn} onPress={() => setShowPreview(false)}>
            <Text style={S.btnTxt}>Unmount Preview</Text>
          </Pressable>
        ) : (
          <Pressable style={S.btn} onPress={remountPreview}>
            <Text style={S.btnTxt}>Mount Preview</Text>
          </Pressable>
        )}

        <Pressable style={S.btn} onPress={() => setFront(v => !v)}>
          <Text style={S.btnTxt}>Flip Camera</Text>
        </Pressable>
      </View>
    </View>
  );
}

const Badge = ({ label }) => (
  <View style={S.badge}><Text style={S.badgeTxt}>{label}</Text></View>
);

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', marginTop: 60 },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewOff: { backgroundColor: '#111' },
  controls: {
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: '#0b0b0b',
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center'
  },
  btn: { backgroundColor: '#27272a', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  go: { backgroundColor: '#16a34a' },
  stop: { backgroundColor: '#ef4444' },
  btnTxt: { color: '#fff', fontWeight: '700' },
  statusRow: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6, zIndex: 1 },
  badge: { backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
