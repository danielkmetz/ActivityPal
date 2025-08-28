import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { Video } from 'expo-av';
import { useSelector } from 'react-redux';
import { makeSelectLiveById } from '../../../Slices/LiveStreamSlice';
import axios from 'axios';
import { getAuthHeaders } from '../../../functions';
import { useRoute, useNavigation } from '@react-navigation/native';
import LiveChatOverlay from './LiveChat/LiveChatOverlay';

const API = `${process.env.EXPO_PUBLIC_API_BASE_URL}/live`;

export default function LivePlayerScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { liveId } = route.params || {};

  const selectLiveById = useMemo(() => makeSelectLiveById(liveId), [liveId]);
  const live = useSelector(selectLiveById);

  const playerRef = useRef(null);
  const [uri, setUri] = useState(live?.playbackUrl || null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (live?.playbackUrl) setUri(live.playbackUrl); }, [live?.playbackUrl]);

  useEffect(() => {
    if (uri) return;
    (async () => {
      try {
        const auth = await getAuthHeaders();
        // Provide a public viewer endpoint if possible:
        const { data } = await axios.get(`${API}/public/${liveId}`, auth).catch(async () => {
          const r = await axios.get(`${API}/status/${liveId}`, auth);
          return { data: { playbackUrl: r?.data?.status?.playbackUrl } };
        });
        if (data?.playbackUrl) setUri(data.playbackUrl);
      } catch (e) {
        setError(e?.response?.data?.message || 'Could not load playback URL');
      }
    })();
  }, [liveId, uri]);

  return (
    <View style={S.container}>
      {!uri && (
        <View style={S.center}>
          <ActivityIndicator />
          <Text style={S.subtle}>Loading stream…</Text>
        </View>
      )}
      {uri && (
        <Video
          ref={playerRef}
          style={S.video}
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
        <View style={S.loadingOverlay}>
          <ActivityIndicator />
          <Text style={S.subtle}>Connecting to live…</Text>
        </View>
      )}
      {!!error && (
        <View style={S.errorOverlay}>
          <Text style={S.errorText}>Couldn’t play the stream.</Text>
          <Text style={S.subtle}>{String(error)}</Text>
          <TouchableOpacity onPress={() => playerRef.current?.playAsync?.()}>
            <Text style={S.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={S.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={S.back}>{'‹ Back'}</Text>
        </TouchableOpacity>
        <Text style={S.title} numberOfLines={1}>{live?.title || 'Live stream'}</Text>
        <View style={{ width: 60 }} />
      </View>
      <LiveChatOverlay liveId={liveId} />
    </View>
  );
}

const S = StyleSheet.create({
  container:{ flex:1, backgroundColor:'black' },
  video:{ width:'100%', height:'100%' },
  center:{ flex:1, justifyContent:'center', alignItems:'center' },
  loadingOverlay:{ position:'absolute', top:'45%', left:0, right:0, alignItems:'center' },
  errorOverlay:{ position:'absolute', top:'40%', left:0, right:0, alignItems:'center', paddingHorizontal:24 },
  errorText:{ color:'#fff', fontWeight:'700', marginBottom:6 },
  subtle:{ color:'#aaa', marginTop:6, textAlign:'center' },
  retry:{ color:'#60a5fa', marginTop:10, fontWeight:'700' },
  topBar:{ position:'absolute', top:36, left:12, right:12, flexDirection:'row',
           alignItems:'center', justifyContent:'space-between' },
  back:{ color:'#fff', fontSize:16 },
  title:{ color:'#fff', fontSize:16, fontWeight:'700', maxWidth:'70%', textAlign:'center' },
});
