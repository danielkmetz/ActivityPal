import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { Video } from 'expo-av';
import { useSelector } from 'react-redux';
import { makeSelectLiveById } from '../../../Slices/LiveStreamSlice';
import LiveChatOverlay from './LiveChatOverlay';
import { useRoute, useNavigation } from '@react-navigation/native';

export default function LivePlayerScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { liveId } = route.params || {};
  const selectLiveById = useMemo(() => makeSelectLiveById(liveId), [liveId]);
  const live = useSelector(selectLiveById);
  
  const playerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const uri = live?.playbackUrl; // direct HLS; no token in Phase 1

  return (
    <View style={styles.container}>
      {!uri && (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.subtle}>Loading stream…</Text>
        </View>
      )}
      {uri && (
        <Video
          ref={playerRef}
          style={styles.video}
          source={{ uri }}
          shouldPlay
          resizeMode="contain"
          useNativeControls={false}
          onLoadStart={() => setIsReady(false)}
          onLoad={() => setIsReady(true)}
          onError={(e) => setError(e?.nativeEvent?.error || 'Playback error')}
          isMuted={false}
        />
      )}
      {!isReady && !error && uri && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator />
          <Text style={styles.subtle}>Connecting to live…</Text>
        </View>
      )}
      {!!error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>Couldn’t play the stream.</Text>
          <Text style={styles.subtle}>{String(error)}</Text>
          <TouchableOpacity onPress={() => playerRef.current?.playAsync?.()}>
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Chat overlay */}
      {!!liveId && <LiveChatOverlay liveId={liveId} />}
      {/* Simple top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'‹ Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{live?.title || 'Live stream'}</Text>
        <View style={{ width: 60 }} />
      </View>
      {/* CTA row (example) */}
      <View style={styles.ctaBar}>
        <TouchableOpacity style={styles.cta}><Text style={styles.ctaText}>Map</Text></TouchableOpacity>
        <TouchableOpacity style={styles.cta}><Text style={styles.ctaText}>Share</Text></TouchableOpacity>
        <TouchableOpacity style={styles.cta}><Text style={styles.ctaText}>Join</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  video: { width: '100%', height: '100%' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center' },
  errorOverlay: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
  errorText: { color: '#fff', fontWeight: '700', marginBottom: 6 },
  subtle: { color: '#aaa', marginTop: 6, textAlign: 'center' },
  retry: { color: '#60a5fa', marginTop: 10, fontWeight: '700' },
  topBar: { position: 'absolute', top: 36, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: '#fff', fontSize: 16 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', maxWidth: '70%', textAlign: 'center' },
  ctaBar: { position: 'absolute', bottom: 24, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 12 },
  cta: { backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  ctaText: { color: '#fff', fontWeight: '600' },
});
