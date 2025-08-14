import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRoute, useNavigation } from '@react-navigation/native';
import axios from 'axios';

const API_BASE = `${process.env.EXPO_PUBLIC_API_BASE_URL}/liveStream`;

// Optional: if you already set axios defaults with an auth header elsewhere, remove this.
async function auth() {
  // Replace with your real token getter if needed
  // e.g., import { getUserToken } from '../utils/auth'
  return null;
}

function Field({ label, value, masked = false, onCopy, onReveal }) {
  const display = masked ? '•'.repeat(Math.max(8, Math.min(24, value?.length || 12))) : value || '—';
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.row}>
        <Text style={styles.fieldValue} numberOfLines={1}>{display}</Text>
        {onReveal && (
          <TouchableOpacity style={styles.chip} onPress={onReveal}>
            <Text style={styles.chipText}>{masked ? 'Show' : 'Hide'}</Text>
          </TouchableOpacity>
        )}
        {onCopy && (
          <TouchableOpacity style={styles.chip} onPress={onCopy}>
            <Text style={styles.chipText}>Copy</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function GoLiveInstructions() {
  const route = useRoute();
  const navigation = useNavigation();
  const { liveId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState(null);
  const [masked, setMasked] = useState(true);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await auth();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      // Owner-only endpoint: returns RTMPS server + streamKey (secret) + playbackUrl + channel info
      const [{ data: creds }, { data: stat }] = await Promise.all([
        axios.get(`${API_BASE}/streams/${liveId}/credentials`, { headers }),
        axios.get(`${API_BASE}/status/${liveId}`, { headers }).catch(() => ({ data: { live: false } })),
      ]);

      setData(creds);
      setStatus(stat);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load stream credentials');
    } finally {
      setLoading(false);
    }
  }, [liveId]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 15000); // poll status every 15s
    return () => clearInterval(t);
  }, [fetchData]);

  const copy = async (text, label = 'Copied!') => {
    try {
      await Clipboard.setStringAsync(String(text || ''));
      Alert.alert(label);
    } catch {
      Alert.alert('Copy failed');
    }
  };

  const rotateKey = async () => {
    Alert.alert(
      'Rotate stream key?',
      'This will invalidate your current stream key. Update OBS with the new key before going live.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rotate',
          style: 'destructive',
          onPress: async () => {
            try {
              setRotating(true);
              const token = await auth();
              const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
              const { data: next } = await axios.post(`${API_BASE}/streams/${liveId}/rotate-key`, {}, { headers });
              setData((prev) => ({ ...prev, ...next }));
              setMasked(true);
              Alert.alert('New stream key generated');
            } catch (e) {
              Alert.alert('Rotate failed', e.response?.data?.message || e.message);
            } finally {
              setRotating(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.subtle}>Loading live setup…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{error}</Text>
        <TouchableOpacity style={styles.primary} onPress={fetchData}>
          <Text style={styles.primaryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!data) return null;

  const {
    title,
    playbackUrl,          // HLS (public for Phase 1)
    rtmpsServer,          // e.g., rtmps://...live-video.net:443/app/
    streamKey,            // secret
    channelArn,           // informative only
    placeId,
  } = data;

  const isLive = !!status?.live;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.h1}>Live Setup</Text>
      <Text style={styles.subtle}>
        Use the details below in OBS/Streamlabs. Start streaming, then use the “Test playback” button.
      </Text>

      <View style={[styles.statusRow, isLive ? styles.liveOn : styles.liveOff]}>
        <View style={[styles.dot, isLive ? styles.dotOn : styles.dotOff]} />
        <Text style={styles.statusText}>{isLive ? 'LIVE' : 'Offline'}</Text>
      </View>

      <Field label="Title" value={title || 'Untitled'} onCopy={() => copy(title, 'Title copied')} />
      <Field label="Playback URL (HLS)" value={playbackUrl} onCopy={() => copy(playbackUrl, 'Playback URL copied')} />
      <Field label="RTMPS Server" value={rtmpsServer} onCopy={() => copy(rtmpsServer, 'RTMPS copied')} />
      <Field
        label="Stream Key"
        value={streamKey}
        masked={masked}
        onReveal={() => setMasked((m) => !m)}
        onCopy={() => copy(streamKey, 'Stream key copied')}
      />

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondary} onPress={() => copy(`${rtmpsServer}\n${streamKey}`, 'Server + key copied')}>
          <Text style={styles.secondaryText}>Copy Server + Key</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondary, rotating && styles.disabled]} disabled={rotating} onPress={rotateKey}>
          <Text style={styles.secondaryText}>{rotating ? 'Rotating…' : 'Rotate Key'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.h2}>OBS Quick Setup</Text>
      <View style={styles.list}>
        <Text style={styles.li}>1. Open OBS → Settings → Stream.</Text>
        <Text style={styles.li}>2. Service: <Text style={styles.bold}>Custom</Text>.</Text>
        <Text style={styles.li}>3. Server: paste the <Text style={styles.bold}>RTMPS Server</Text> above.</Text>
        <Text style={styles.li}>4. Stream Key: paste your <Text style={styles.bold}>Stream Key</Text>.</Text>
        <Text style={styles.li}>5. Output → Bitrate: <Text style={styles.bold}>2500–3500 Kbps</Text>; Keyframe: <Text style={styles.bold}>2s</Text>.</Text>
        <Text style={styles.li}>6. Video → Base/Output: <Text style={styles.bold}>1280×720</Text> (start simple).</Text>
        <Text style={styles.li}>7. Click <Text style={styles.bold}>Start Streaming</Text>.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primary}
          onPress={() => navigation.navigate('LivePlayer', { liveId })}
        >
          <Text style={styles.primaryText}>Test playback</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghost}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.ghostText}>Done</Text>
        </TouchableOpacity>
      </View>

      {!!placeId && (
        <>
          <Text style={styles.h2}>Tip</Text>
          <Text style={styles.subtle}>
            Since this stream is tied to a place, we’ll show a LIVE badge on that map pin while you’re broadcasting.
          </Text>
        </>
      )}

      <View style={styles.divider} />
      <Text style={styles.footnote}>
        Keep your stream key secret. Rotating your key will immediately invalidate the old one.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#0b0b0b' },
  h1: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  h2: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  subtle: { color: '#b3b3b3' },
  err: { color: '#ff8b8b', textAlign: 'center', marginBottom: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#0b0b0b' },
  field: { marginTop: 14 },
  fieldLabel: { color: '#9ca3af', fontSize: 12, marginBottom: 6 },
  fieldValue: { color: '#fff', fontSize: 14, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  primary: { backgroundColor: '#e11d48', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondary: { backgroundColor: '#1f2937', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center' },
  secondaryText: { color: '#e5e7eb', fontWeight: '700' },
  ghost: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  ghostText: { color: '#9ca3af', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  liveOn: { },
  liveOff: { },
  dot: { width: 10, height: 10, borderRadius: 6 },
  dotOn: { backgroundColor: '#22c55e' },
  dotOff: { backgroundColor: '#6b7280' },
  statusText: { color: '#fff', fontWeight: '700' },
  list: { marginTop: 6, gap: 6 },
  li: { color: '#e5e7eb' },
  bold: { fontWeight: '800', color: '#fff' },
  divider: { height: 1, backgroundColor: '#1f2937', marginTop: 24 },
  footnote: { color: '#9ca3af', marginTop: 10, fontSize: 12, lineHeight: 18 },
});
