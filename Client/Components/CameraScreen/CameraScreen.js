import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import Animated, {
  useSharedValue,
  runOnJS,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  useAnimatedProps,
} from 'react-native-reanimated';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import CameraControls from './CameraControls'; // ⬅️ new import

const AnimatedCamera = Animated.createAnimatedComponent(Camera);

const formatTime = (ms = 0) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

export default function CameraScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const { onCapture } = route.params || {};
  const cameraRef = useRef(null);
  const [facing, setFacing] = useState('back');
  const device = useCameraDevice(facing);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [mode, setMode] = useState('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [cameraActive] = useState(true);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const hasFlash = !!device?.hasFlash;

  // ===== Normalized zoom (0..1) =====
  const normZoom = useSharedValue(0);
  const minSV = useSharedValue(1);
  const maxSV = useSharedValue(1);
  const isRecordingSV = useSharedValue(false);

  useEffect(() => {
    if (device) {
      const min = device?.minZoom ?? 1;
      const max = Math.min(device?.maxZoom ?? 1, 16);
      const neutral = device?.neutralZoom ?? min;
      const range = Math.max(max - min, 1e-6);
      minSV.value = min;
      maxSV.value = max;
      const initialNorm = (neutral - min) / range;
      normZoom.value = Math.max(0, Math.min(1, initialNorm));
    }
  }, [device, minSV, maxSV, normZoom]);

  useEffect(() => {
    isRecordingSV.value = isRecording;
  }, [isRecording, isRecordingSV]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    }).catch(() => {});
  }, []);

  const animatedCameraProps = useAnimatedProps(() => {
    'worklet';
    const min = minSV.value;
    const max = maxSV.value;
    const range = max - min;
    const z = min + (range <= 0 ? 0 : normZoom.value * range);
    const clamped = z < min ? min : z > max ? max : z;
    return { zoom: clamped };
  });

  // ==== Shutter morph (video only) ====
  const animatedSize = useSharedValue(60);
  const animatedRadius = useSharedValue(30);
  useEffect(() => {
    if (mode === 'video') {
      if (isRecording) {
        animatedSize.value = withTiming(28, { duration: 300 });
        animatedRadius.value = withTiming(6, { duration: 300 });
      } else {
        animatedSize.value = withTiming(60, { duration: 300 });
        animatedRadius.value = withTiming(30, { duration: 300 });
      }
    }
  }, [isRecording, mode, animatedSize, animatedRadius]);

  const videoAnimatedStyle = useAnimatedStyle(() => ({
    width: animatedSize.value,
    height: animatedSize.value,
    borderRadius: animatedRadius.value,
  }));

  useEffect(() => { if (!hasPermission) requestPermission(); }, [hasPermission, requestPermission]);

  // ==================== Gestures ====================
  const pinchGesture = Gesture.Pinch()
    .onChange((e) => {
      'worklet';
      const SENS = 0.12;
      const delta = (e.scale - 1) * SENS;
      let next = normZoom.value + delta;
      normZoom.value = Math.max(0, Math.min(1, next));
    });

  const panGesture = Gesture.Pan()
    .onChange((e) => {
      'worklet';
      if (!isRecordingSV.value) return;
      const delta = -e.changeY / 300;
      let next = normZoom.value + delta;
      normZoom.value = Math.max(0, Math.min(1, next));
    });

  // ====== Segments + recording bridge ======
  const segmentsRef = useRef([]);
  const recordingDonePromiseRef = useRef(null);
  const resolveRecordingDoneRef = useRef(null);

  const isRecordingRef = useRef(false);
  const facingRef = useRef(facing);
  useEffect(() => { facingRef.current = facing; }, [facing]);

  const initializedPromiseRef = useRef(Promise.resolve());
  const resolveInitializedRef = useRef(null);

  const dePrivatize = (u = '') => u.replace(/^file:\/\/\/private\//, 'file:///');
  const normalizeFileUri = (u = '') =>
    u ? dePrivatize(u.replace(/^file:\/+file:\/+/, 'file://').replace(/^file:\/{2,}/, 'file:///')) : u;

  const toFileUri = (p) => {
    if (!p) return null;
    const prefixed = p.startsWith('file://') ? p : `file://${p}`;
    return normalizeFileUri(prefixed);
  };

  const inferExt = (path = '') => {
    const raw = path.split('?')[0];
    const ext = raw.slice(raw.lastIndexOf('.') + 1).toLowerCase();
    return ext || (Platform.OS === 'ios' ? 'mov' : 'mp4');
  };

  const stabilizeRecording = async (srcFileUri) => {
    try {
      const info = await FileSystem.getInfoAsync(srcFileUri, { size: true });
      if (!info.exists || !info.size) await new Promise((r) => setTimeout(r, 60));
      const dir = `${FileSystem.cacheDirectory}stories/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const ext = inferExt(srcFileUri.replace('file://', ''));
      const dest = normalizeFileUri(`${dir}rec_${Date.now()}.${ext}`);
      await FileSystem.copyAsync({ from: srcFileUri, to: dest });
      try { await FileSystem.deleteAsync(srcFileUri, { idempotent: true }); } catch {}
      return dest;
    } catch (e) {
      return normalizeFileUri(srcFileUri);
    }
  };

  // ===== Recording timer =====
  const [elapsedMs, setElapsedMs] = useState(0);
  const sessionOriginRef = useRef(null);
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    let id;
    if (isRecording) {
      const origin = Date.now() - elapsedMs;
      sessionOriginRef.current = origin;
      dotOpacity.value = withRepeat(withTiming(0, { duration: 800 }), -1, true);
      id = setInterval(() => setElapsedMs(Date.now() - origin), 200);
    } else {
      dotOpacity.value = 1;
      if (id) clearInterval(id);
    }
    return () => { if (id) clearInterval(id); };
  }, [isRecording, dotOpacity, elapsedMs]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  const startRecording = useCallback(() => {
    if (!cameraRef.current || isRecordingRef.current) return;

    Audio.setAudioModeAsync({ allowsRecordingIOS: true }).catch(() => {});

    isRecordingRef.current = true;
    recordingDonePromiseRef.current = new Promise((resolve) => {
      resolveRecordingDoneRef.current = resolve;
    });

    if (elapsedMs === 0) sessionOriginRef.current = Date.now();

    cameraRef.current.startRecording({
      flash: 'off',
      fileType: 'mp4',
      videoCodec: 'h264',
      onRecordingFinished: async (video) => {
        const rawUri = video?.path ? toFileUri(video.path) : null;
        let stableUri = rawUri;
        if (rawUri) stableUri = await stabilizeRecording(rawUri);
        if (stableUri) {
          const finalUri = normalizeFileUri(stableUri);
          segmentsRef.current.push({ uri: finalUri, camera: facingRef.current });
        }
        isRecordingRef.current = false;
        resolveRecordingDoneRef.current?.(video);
        resolveRecordingDoneRef.current = null;
      },
      onRecordingError: () => {
        isRecordingRef.current = false;
        resolveRecordingDoneRef.current?.(null);
        resolveRecordingDoneRef.current = null;
        Alert.alert('Error', 'Failed to record video.');
      },
    });

    setIsRecording(true);
  }, [elapsedMs]);

  const stopRecording = useCallback(async () => {
    if (!cameraRef.current || !isRecordingRef.current) return;
    try {
      await cameraRef.current.stopRecording();
      if (recordingDonePromiseRef.current) await recordingDonePromiseRef.current;
      await new Promise((r) => setTimeout(r, 40));

      const segments = [...segmentsRef.current];
      segmentsRef.current = [];
      setIsRecording(false);

      const file = { mediaType: 'video', segments };
      if (onCapture) { onCapture([file]); nav.goBack(); }
      else { nav.navigate('StoryPreview', { file }); }
    } catch (e) {
      setIsRecording(false);
    } finally {
      recordingDonePromiseRef.current = null;
      resolveRecordingDoneRef.current = null;
      isRecordingRef.current = false;
      setElapsedMs(0);
      sessionOriginRef.current = null;
    }
  }, [nav, onCapture]);

  // ==== Flip handling ====
  const toggleCameraFacing = useCallback(async () => {
    if (mode === 'video' && isRecordingRef.current && cameraRef.current) {
      try {
        await cameraRef.current.stopRecording();
        if (recordingDonePromiseRef.current) await recordingDonePromiseRef.current;

        setFacing((prev) => (prev === 'back' ? 'front' : 'back'));

        initializedPromiseRef.current = new Promise((resolve) => { resolveInitializedRef.current = resolve; });
        await new Promise((r) => setTimeout(r, 120));
        await initializedPromiseRef.current;
        await new Promise((r) => setTimeout(r, 50));

        startRecording();
      } catch (e) {
        // no-op
      }
    } else {
      setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
    }
  }, [mode, startRecording]);

  const doubleTapGesture = Gesture.Tap().numberOfTaps(2).onEnd(() => runOnJS(toggleCameraFacing)());
  const combinedGesture = Gesture.Simultaneous(panGesture, pinchGesture, doubleTapGesture);

  // ==== Photo ====
  const takePhoto = useCallback(async () => {
    try {
      if (!cameraRef.current) return;
      const photo = await cameraRef.current.takePhoto({
        flash: flashEnabled && hasFlash ? 'on' : 'off',
        enableShutterSound: true,
      });
      const file = {
        uri: `file://${photo.path}`,
        width: photo.width,
        height: photo.height,
        mediaType: 'photo',
        taggedUsers: [],
        description: '',
      };
      if (onCapture) { onCapture([file]); nav.goBack(); }
      else { nav.navigate('StoryPreview', { file }); }
    } catch {
      Alert.alert('Error', 'Failed to take photo.');
    }
  }, [nav, onCapture, flashEnabled, hasFlash]);

  const handleCapturePress = () => {
    if (mode === 'photo') takePhoto();
    else isRecordingRef.current ? stopRecording() : startRecording();
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to access the camera</Text>
        <TouchableOpacity onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>No camera device available</Text>
      </View>
    );
  }

  return (
    <GestureDetector gesture={combinedGesture}>
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill}>
          <AnimatedCamera
            ref={cameraRef}
            style={styles.camera}
            device={device}
            isActive={isFocused && cameraActive}
            photo={mode === 'photo'}
            video={mode === 'video'}
            audio={mode === 'video'}
            torch={mode === 'video' && flashEnabled && hasFlash ? 'on' : 'off'}
            animatedProps={animatedCameraProps}
            onInitialized={() => {
              if (resolveInitializedRef.current) {
                resolveInitializedRef.current();
                resolveInitializedRef.current = null;
              }
            }}
            onError={(e) => { console.log('Camera onError:', e); }}
          />
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={() => nav.goBack()}>
          <Ionicons name="close" size={40} color="#fff" />
        </TouchableOpacity>
        {/* ⏱ Recording Timer HUD */}
        {mode === 'video' && (
          <View style={styles.topHud}>
            {isRecording && (
              <View style={styles.timerPill}>
                <Animated.View style={[styles.recordDot, dotStyle]} />
                <Text style={styles.timerText}>{formatTime(elapsedMs)}</Text>
              </View>
            )}
          </View>
        )}
        <CameraControls
          mode={mode}
          isRecording={isRecording}
          hasFlash={hasFlash}
          flashEnabled={flashEnabled}
          onToggleFlash={() => setFlashEnabled((v) => !v)}
          onFlip={toggleCameraFacing}
          onCapturePress={handleCapturePress}
          onChangeMode={setMode}
          videoAnimatedStyle={videoAnimatedStyle}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  message: { textAlign: 'center', marginTop: 40, color: '#fff' },
  camera: { flex: 1 },
  buttonText: { color: '#1e90ff', fontWeight: 'bold', fontSize: 16, textAlign: 'center', marginTop: 10 },
  closeButton: { position: 'absolute', top: 60, left: 20, zIndex: 10, padding: 8, borderRadius: 20 },
  topHud: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center', zIndex: 9 },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20,20,20,0.6)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'red', marginRight: 8 },
  timerText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
