import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';

const API_BASE = `${process.env.EXPO_PUBLIC_API_BASE_URL}/liveStream`;

export default function GoLiveSetup() {
  const navigation = useNavigation();
  const route = useRoute();
  const [title, setTitle] = useState('');
  const [placeId, setPlaceId] = useState(route.params?.defaultPlaceId || '');

  const createChannel = async () => {
    try {
      const { data } = await axios.post(`${API_BASE}/streams`, {
        title,
        placeId,
        recording: false, // Phase 1: optional
      });
      // Option A: take hosts to an instructions screen with their RTMPS server/key
      navigation.navigate('GoLiveInstructions', { liveId: data.id });
      // Option B later: open camera publisher (mobile RTMP/WebRTC) when you build it
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to create live stream.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Go Live</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="What’s happening?" />

      <Text style={styles.label}>Place ID (optional)</Text>
      <TextInput value={placeId} onChangeText={setPlaceId} style={styles.input} placeholder="Google place_id" />

      <TouchableOpacity style={styles.cta} onPress={createChannel}>
        <Text style={styles.ctaText}>Create Stream</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        For Phase 1: creators go live with OBS/Streamlabs using the RTMPS server + stream key from the next screen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#111' },
  h1: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  label: { color: '#bbb', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#1b1b1b', color: '#fff', padding: 12, borderRadius: 8 },
  cta: { marginTop: 20, backgroundColor: '#e11d48', padding: 14, borderRadius: 10, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '700' },
  note: { color: '#888', marginTop: 12, fontSize: 12, lineHeight: 18 },
});
