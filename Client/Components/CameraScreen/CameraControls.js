import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

export default function CameraControls({
  mode,
  isRecording,            // not used visually right now, but handy if you want to disable buttons
  hasFlash,
  flashEnabled,
  onToggleFlash,
  onFlip,
  onCapturePress,
  onChangeMode,
  videoAnimatedStyle,     // Animated style for the red square morph
}) {
  return (
    <View style={styles.controls}>
      {hasFlash && (
        <TouchableOpacity style={styles.flashButton} onPress={onToggleFlash}>
          <Ionicons
            name={flashEnabled ? 'flash' : 'flash-off'}
            size={28}
            color={flashEnabled ? '#FFD700' : '#fff'}
          />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.flipButton} onPress={onFlip}>
        <Ionicons name="camera-reverse" size={28} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.captureButtonWrapper,
          mode === 'video' ? styles.videoWrapper : styles.photoWrapper,
        ]}
        onPress={onCapturePress}
        activeOpacity={0.7}
      >
        {mode === 'video' ? (
          <Animated.View style={[styles.videoInner, videoAnimatedStyle]} />
        ) : (
          <View style={styles.photoInner} />
        )}
      </TouchableOpacity>
      <View style={styles.modeToggle}>
        <TouchableOpacity onPress={() => onChangeMode('photo')}>
          <Text style={[styles.modeText, mode === 'photo' && styles.activeMode]}>PHOTO</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onChangeMode('video')}>
          <Text style={[styles.modeText, mode === 'video' && styles.activeMode]}>VIDEO</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashButton: { position: 'absolute', top: -140, right: 15 },
  flipButton: { position: 'absolute', top: -80, right: 15 },
  modeToggle: { flexDirection: 'row', marginTop: 20, justifyContent: 'center' },
  modeText: { fontSize: 16, color: '#888', marginHorizontal: 20 },
  activeMode: { color: '#fff', fontWeight: 'bold' },

  captureButtonWrapper: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
  },
  videoWrapper: { borderWidth: 4, borderColor: '#fff', backgroundColor: 'transparent' },
  videoInner: { width: 60, height: 60, backgroundColor: 'red' },
  photoWrapper: { borderWidth: 4, borderColor: '#fff', backgroundColor: '#fff' },
  photoInner: {
    width: 64, height: 64, backgroundColor: '#fff',
    borderRadius: 32, borderWidth: 2, borderColor: '#eee',
  },
});
