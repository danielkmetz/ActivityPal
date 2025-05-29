import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS, useAnimatedStyle, withTiming, } from 'react-native-reanimated';
import Animated from 'react-native-reanimated';

const CameraScreen = () => {
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState("back");
    const [isRecording, setIsRecording] = useState(false);
    const [cameraIsReady, setCameraIsReady] = useState(false);
    const zoomShared = useSharedValue(0.1);
    const [zoom, setZoom] = useState(0.1); // still needed to sync with CameraView
    const [mode, setMode] = useState('photo');
    const wasZoomingRef = useRef(false);
    const cameraRef = useRef(null);
    const navigation = useNavigation();
    const recordingPromiseRef = useRef(null);
    const baseZoom = useSharedValue(0);
    const buttonRecording = useRef(false);
    const gestureInProgress = useRef(false);
    const recordedSegments = useRef([]); // Store multiple segments if flipped during recording
    const justFlippedRef = useRef(false);
    const animatedSize = useSharedValue(60); // Initial circle size
    const animatedRadius = useSharedValue(30); // Initial border radius

    useEffect(() => {
        if (cameraIsReady) {
            const initialZoom = 0.01;
            setZoom(initialZoom);
            zoomShared.value = initialZoom;
        }
    }, [cameraIsReady]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            setIsRecording(false);
            buttonRecording.current = false;
            justFlippedRef.current = false;
            zoomShared.value = 0.1;
            setZoom(0.1);
        });

        return unsubscribe;
    }, [navigation]);

    useEffect(() => {
        if (mode === 'video') {
            if (isRecording) {
                animatedSize.value = withTiming(28, { duration: 300 });
                animatedRadius.value = withTiming(6, { duration: 300 });
            } else {
                animatedSize.value = withTiming(60, { duration: 300 }); // match styles.videoInner
                animatedRadius.value = withTiming(30, { duration: 300 }); // perfect circle again
            }
        }
    }, [isRecording]);

    const toggleCameraFacing = async () => {
        if (isRecording && cameraRef.current) {
            try {
                justFlippedRef.current = true;

                const segmentPromise = recordingPromiseRef.current;
                await cameraRef.current.stopRecording();

                // Store the resolved video segment
                segmentPromise.then((video) => {
                    if (video?.uri) {
                        recordedSegments.current.push({ uri: video.uri, camera: facing });
                    }
                });

                // Flip camera
                setFacing(prev => (prev === 'back' ? 'front' : 'back'));

                // Restart recording after delay
                setTimeout(() => {
                    startRecording();
                }, 500);
            } catch (err) {
                console.log("⚠️ Flip + stopRecording failed:", err);
            }
        } else {
            setFacing(prev => (prev === 'back' ? 'front' : 'back'));
        }
    };

    const markZooming = () => {
        wasZoomingRef.current = true;
    };

    const endZooming = () => {
        wasZoomingRef.current = false;
    }

    const pinchGesture = Gesture.Pinch()
        .onChange((e) => {
            'worklet';
            const ZOOM_SENSITIVITY = 0.1;
            let delta = (e.scale - 1) * ZOOM_SENSITIVITY;
            let nextZoom = zoomShared.value + delta;
            nextZoom = Math.max(0, Math.min(nextZoom, 1)); // clamp

            zoomShared.value = nextZoom;
            runOnJS(setZoom)(nextZoom);
        });

    const panGesture = Gesture.Pan()
        .onChange((e) => {
            'worklet';
            if (isRecording) {
                const zoomDelta = -e.changeY / 300;
                let nextZoom = zoomShared.value + zoomDelta;
                nextZoom = Math.max(0, Math.min(nextZoom, 1));
                zoomShared.value = nextZoom;
                runOnJS(setZoom)(nextZoom);
            }
        });

    const takePhoto = async () => {
        try {
            if (!cameraRef.current) return;
            const photo = await cameraRef.current.takePictureAsync();
            console.log('📷 photo taken:', photo);
            if (photo?.uri) {
                navigation.navigate('StoryPreview', { file: { ...photo, mediaType: 'photo' } });
            } else {
                throw new Error("No photo URI returned");
            }
        } catch (err) {
            Alert.alert('Error', 'Failed to take photo');
        }
    };

    const startRecording = () => {
        if (!cameraIsReady || !cameraRef.current) {
            console.log("🚫 startRecording aborted — camera not ready");
            return;
        }
        setIsRecording(true);

        try {
            const promise = cameraRef.current.recordAsync({ maxDuration: 60 });
            recordingPromiseRef.current = promise;

            promise
                .then((video) => {
                    if (!justFlippedRef.current) {
                        setIsRecording(false);
                    } else {
                        console.log("🔁 Just flipped — keeping isRecording true");
                    }
                    if (wasZoomingRef.current) {
                        return;
                    }

                    if (video?.uri) {
                        if (buttonRecording.current || justFlippedRef.current) {
                            recordedSegments.current.push({ uri: video.uri, camera: facing });
                        } else {
                            console.log("🧼 Skipping duplicate push for final segment");
                        }
                        if (justFlippedRef.current) {
                            justFlippedRef.current = false;
                            return;
                        }
                    } else {
                        Alert.alert('Error', 'Recording completed but no video URI returned.');
                    }
                })
                .catch((err) => {
                    setIsRecording(false);
                    Alert.alert('Error', 'Failed to record video');
                });
        } catch (err) {
            setIsRecording(false);
            Alert.alert('Error', 'Recording failed unexpectedly');
        }
    };

    const stopRecording = async () => {
        if (!cameraRef.current || !isRecording) {
            return;
        }

        try {
            buttonRecording.current = false;
            const lastSegmentPromise = recordingPromiseRef.current;

            await cameraRef.current.stopRecording();

            const lastSegment = await lastSegmentPromise;
            if (lastSegment?.uri) {
                recordedSegments.current.push({ uri: lastSegment.uri, camera: facing });
            } else {
                console.log("⚠️ Final segment missing URI");
            }

            const allSegments = [...recordedSegments.current];
            recordedSegments.current = [];
            setIsRecording(false);

            navigation.navigate('StoryPreview', {
                file: {
                    mediaType: 'video',
                    segments: allSegments,
                }
            });
        } catch (err) {
            setIsRecording(false);
        }
    };

    const handleCapturePress = () => {
        if (mode === 'photo') {
            takePhoto();
        } else {
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        }
    };

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            runOnJS(toggleCameraFacing)();
        });

    const combinedGesture = Gesture.Simultaneous(
        panGesture,
        pinchGesture,
        doubleTapGesture,
    );
    const animatedStyle = useAnimatedStyle(() => {
        return {
            width: animatedSize.value,
            height: animatedSize.value,
            borderRadius: animatedRadius.value,
        };
    });


    if (!permission || !permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>We need your permission to access the camera</Text>
                <TouchableOpacity onPress={requestPermission}>
                    <Text style={styles.buttonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <GestureDetector gesture={combinedGesture}>
            <View style={styles.container}>
                <View style={StyleSheet.absoluteFill}>
                    <CameraView
                        style={styles.camera}
                        facing={facing}
                        ref={cameraRef}
                        mode={mode}
                        zoom={zoom}
                        enableZoomGesture={true} // we're handling zoom ourselves
                        onCameraReady={() => setCameraIsReady(true)}
                    />
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={40} color="#fff" />
                </TouchableOpacity>

                <View style={styles.controls}>
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
                        {mode === 'video' && (
                            <Animated.View style={[styles.videoInner, animatedStyle]} />
                        )}
                        {mode === 'photo' && (
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
};

export default CameraScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    message: {
        textAlign: 'center',
        marginTop: 40,
        color: '#fff',
    },
    camera: {
        flex: 1,
    },
    controls: {
        position: 'absolute',
        bottom: 40,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    captureButton: {
        backgroundColor: '#fff',
        borderRadius: 40,
        width: 80,
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
    },
    flipButton: {
        position: 'absolute',
        top: -60,
        right: 30,
    },
    buttonText: {
        color: '#1e90ff',
        fontWeight: 'bold',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 10,
    },
    closeButton: {
        position: 'absolute',
        top: 60,
        left: 20,
        zIndex: 10,
        padding: 8,
        borderRadius: 20,
    },
    captureWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 50,
        padding: 5,
    },
    modeToggle: {
        flexDirection: 'row',
        marginTop: 20,
        justifyContent: 'center',
    },
    modeText: {
        fontSize: 16,
        color: '#888',
        marginHorizontal: 20,
    },
    activeMode: {
        color: '#fff',
        fontWeight: 'bold',
    },
    captureButtonWrapper: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // ==== VIDEO ====
    videoWrapper: {
        borderWidth: 4,
        borderColor: '#fff',
        backgroundColor: 'transparent',
    },

    videoInner: {
        width: 60,
        height: 60,
        backgroundColor: 'red',
    },

    recordingCircle: {
        borderRadius: 30,
    },

    recordingSquare: {
        borderRadius: 10,
        width: 35,
        height: 35,
    },

    // ==== PHOTO ====
    photoWrapper: {
        borderWidth: 4,
        borderColor: '#fff',
        backgroundColor: '#fff',
    },

    photoInner: {
        width: 64,
        height: 64,
        backgroundColor: '#fff',
        borderRadius: 32,
        borderWidth: 2,
        borderColor: '#eee', // Slight gray to separate from outer white
    },

});