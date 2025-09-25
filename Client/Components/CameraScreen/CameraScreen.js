import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
  useAnimatedStyle,
  withTiming,
  useAnimatedProps,
} from 'react-native-reanimated';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

const AnimatedCamera = Animated.createAnimatedComponent(Camera);

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

  // ===== Normalized zoom (0..1) -> mapped to device zoom via animatedProps =====
  const normZoom = useSharedValue(0); // 0..1
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
      normZoom.value = initialNorm < 0 ? 0 : initialNorm > 1 ? 1 : initialNorm;
    }
  }, [device, minSV, maxSV, normZoom]);

  useEffect(() => {
    isRecordingSV.value = isRecording;
  }, [isRecording, isRecordingSV]);

  const animatedCameraProps = useAnimatedProps(() => {
    'worklet';
    const min = minSV.value;
    const max = maxSV.value;
    const range = max - min;
    const z = min + (range <= 0 ? 0 : normZoom.value * range);
    const clamped = z < min ? min : z > max ? max : z;
    return { zoom: clamped };
  });

  // ==== Shutter UI ====
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

  const animatedStyle = useAnimatedStyle(() => ({
    width: animatedSize.value,
    height: animatedSize.value,
    borderRadius: animatedRadius.value,
  }));

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // ==================== Gestures ====================
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
    })
    .onChange((e) => {
      'worklet';
      const SENS = 0.12; // tweak
      const delta = (e.scale - 1) * SENS;
      let next = normZoom.value + delta;
      next = next < 0 ? 0 : next > 1 ? 1 : next;
      normZoom.value = next;
    });

  const panGesture = Gesture.Pan()
    .onChange((e) => {
      'worklet';
      if (!isRecordingSV.value) return;
      const delta = -e.changeY / 300; // tweak sensitivity
      let next = normZoom.value + delta;
      next = next < 0 ? 0 : next > 1 ? 1 : next;
      normZoom.value = next;
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

  // ==== Video (with segments) ====
  const toFileUri = (p) => (p?.startsWith('file://') ? p : `file://${p}`);

  const startRecording = useCallback(() => {
    if (!cameraRef.current || isRecordingRef.current) return;

    isRecordingRef.current = true;
    recordingDonePromiseRef.current = new Promise((resolve) => {
      resolveRecordingDoneRef.current = resolve;
    });

    cameraRef.current.startRecording({
      flash: 'off', // not used for video; torch prop controls light
      onRecordingFinished: (video) => {
        const uri = video?.path ? toFileUri(video.path) : null;
        if (uri) {
          segmentsRef.current.push({ uri, camera: facingRef.current });
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
  }, []);

  const stopRecording = useCallback(async () => {
    if (!cameraRef.current || !isRecordingRef.current) return;
    try {
      await cameraRef.current.stopRecording();
      if (recordingDonePromiseRef.current) {
        await recordingDonePromiseRef.current;
      }

      const segments = [...segmentsRef.current];
      segmentsRef.current = [];

      setIsRecording(false);

      const file = { mediaType: 'video', segments };
      if (onCapture) { onCapture([file]); nav.goBack(); }
      else { nav.navigate('StoryPreview', { file }); }
    } catch (e) {
      console.log(e);
      setIsRecording(false);
    } finally {
      recordingDonePromiseRef.current = null;
      resolveRecordingDoneRef.current = null;
      isRecordingRef.current = false;
    }
  }, [nav, onCapture]);

  // ==== Flip handling ====
  const toggleCameraFacing = useCallback(async () => {
    if (mode === 'video' && isRecordingRef.current && cameraRef.current) {
      try {
        await cameraRef.current.stopRecording();
        if (recordingDonePromiseRef.current) {
          await recordingDonePromiseRef.current;
        }

        setFacing((prev) => (prev === 'back' ? 'front' : 'back'));

        initializedPromiseRef.current = new Promise((resolve) => {
          resolveInitializedRef.current = resolve;
        });
        await new Promise((r) => setTimeout(r, 120));
        await initializedPromiseRef.current;
        await new Promise((r) => setTimeout(r, 50));

        startRecording();
      } catch (e) {
        console.log('⚠️ Flip flow failed:', e);
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
            // Torch controls continuous light (video). We keep it off for photo preview.
            torch={mode === 'video' && flashEnabled && hasFlash ? 'on' : 'off'}
            animatedProps={animatedCameraProps}
            onInitialized={() => {
              if (resolveInitializedRef.current) {
                resolveInitializedRef.current();
                resolveInitializedRef.current = null;
              }
            }}
            onError={(e) => {
              console.log('Camera onError:', e);
            }}
          />
        </View>

        <TouchableOpacity style={styles.closeButton} onPress={() => nav.goBack()}>
          <Ionicons name="close" size={40} color="#fff" />
        </TouchableOpacity>

        <View style={styles.controls}>
          {/* 🔦 Flash toggle (above flip) */}
          {hasFlash && (
            <TouchableOpacity
              style={styles.flashButton}
              onPress={() => setFlashEnabled((v) => !v)}
            >
              <Ionicons
                name={flashEnabled ? 'flash' : 'flash-off'}
                size={28}
                color={flashEnabled ? '#FFD700' : '#fff'}
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
            <Ionicons name="camera-reverse" size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.captureButtonWrapper,
              mode === 'video' && styles.videoWrapper,
              mode === 'photo' && styles.photoWrapper,
            ]}
            onPress={handleCapturePress}
          >
            {mode === 'video' ? (
              <Animated.View style={[styles.videoInner, animatedStyle]} />
            ) : (
              <View style={styles.photoInner} />
            )}
          </TouchableOpacity>

          <View style={styles.modeToggle}>
            <TouchableOpacity onPress={() => setMode('photo')}>
              <Text style={[styles.modeText, mode === 'photo' && styles.activeMode]}>PHOTO</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('video')}>
              <Text style={[styles.modeText, mode === 'video' && styles.activeMode]}>VIDEO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  message: { textAlign: 'center', marginTop: 40, color: '#fff' },
  camera: { flex: 1 },
  controls: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center', justifyContent: 'center' },
  flashButton: { position: 'absolute', top: -100, right: 30 },
  flipButton: { position: 'absolute', top: -60, right: 30 },
  buttonText: { color: '#1e90ff', fontWeight: 'bold', fontSize: 16, textAlign: 'center', marginTop: 10 },
  closeButton: { position: 'absolute', top: 60, left: 20, zIndex: 10, padding: 8, borderRadius: 20 },
  modeToggle: { flexDirection: 'row', marginTop: 20, justifyContent: 'center' },
  modeText: { fontSize: 16, color: '#888', marginHorizontal: 20 },
  activeMode: { color: '#fff', fontWeight: 'bold' },
  captureButtonWrapper: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  videoWrapper: { borderWidth: 4, borderColor: '#fff', backgroundColor: 'transparent' },
  videoInner: { width: 60, height: 60, backgroundColor: 'red' },
  photoWrapper: { borderWidth: 4, borderColor: '#fff', backgroundColor: '#fff' },
  photoInner: { width: 64, height: 64, backgroundColor: '#fff', borderRadius: 32, borderWidth: 2, borderColor: '#eee' },
});
