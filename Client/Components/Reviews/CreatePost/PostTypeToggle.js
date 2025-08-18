import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as CameraPerms from 'expo-camera';
import * as MicPerms from 'expo-av';

// Props:
// - postType: string
// - setPostType: fn(key)
// - onLivePress: fn({ defaultPlaceId }) -> usually navigation.navigate('PreLive', { defaultPlaceId })
// - defaultPlaceId?: string (optional)
export default function PostTypeToggle({ postType, setPostType, onLivePress, defaultPlaceId }) {
  const [startingLive, setStartingLive] = useState(false);

  const types = [
    { key: 'review', label: 'Review' },
    { key: 'check-in', label: 'Check-in' },
    { key: 'invite', label: 'Invite' },
  ];

  const handleSelect = (key) => setPostType?.(key);

  const handleLive = async () => {
    if (startingLive) return;
    try {
      setStartingLive(true);

      // Request perms up-front so we fail fast like IG/FB
      const cam = await CameraPerms.Camera.requestCameraPermissionsAsync();
      const mic = await MicPerms.Audio.requestPermissionsAsync();
      if (cam.status !== 'granted' || mic.status !== 'granted') {
        Alert.alert('Permissions needed', 'Please allow camera and microphone to go live.');
        return;
      }

      // Hand off to your preflight screen
      onLivePress?.({ defaultPlaceId });
    } catch (e) {
      Alert.alert('Go Live', e?.message || 'Unable to start live.');
    } finally {
      setStartingLive(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {types.map(({ key, label }) => {
          const isActive = postType === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handleSelect(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={label}
            >
              <Text style={[styles.tabTxt, isActive && styles.tabTxtActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Live is a distinct CTA, not a selectable tab */}
      <TouchableOpacity
        style={[styles.liveBtn, startingLive && styles.liveBtnDisabled]}
        onPress={handleLive}
        disabled={startingLive}
        accessibilityRole="button"
        accessibilityLabel="Go Live"
      >
        {startingLive ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.liveTxt}>Live</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 1,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: 'tomato',
  },
  tabTxt: {
    fontSize: 16,
    color: '#777',
  },
  tabTxtActive: {
    color: 'tomato',
    fontWeight: 'bold',
  },
  // Live CTA (distinct styling)
  liveBtn: {
    backgroundColor: '#e11d48',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  liveBtnDisabled: { opacity: 0.6 },
  liveTxt: {
    color: '#fff',
    fontWeight: '800',
  },
});
