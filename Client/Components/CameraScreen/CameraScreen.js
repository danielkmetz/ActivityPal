import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Alert, PanResponder } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';

const CameraScreen = () => {
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState("back");
    const [isRecording, setIsRecording] = useState(false);
    const [cameraIsReady, setCameraIsReady] = useState(false);
    const zoomShared = useSharedValue(0.1);
    const [zoom, setZoom] = useState(0.1); // still needed to sync with CameraView
    const wasZoomingRef = useRef(false);
    const cameraRef = useRef(null);
    const navigation = useNavigation();
    const recordingPromiseRef = useRef(null);
    const pressStartTime = useRef(null);
    const isPressingRef = useRef(false);
    const baseZoom = useSharedValue(0);
    const buttonRecording = useRef(false);
    const gestureInProgress = useRef(false);
    const recordedSegments = useRef([]); // Store multiple segments if flipped during recording
    const justFlippedRef = useRef(false);

    const MIN_RECORD_DURATION = 300; // ms threshold to switch from photo to video

    useEffect(() => {
        if (cameraIsReady) {
            const initialZoom = 0.01;
            setZoom(initialZoom);
            zoomShared.value = initialZoom;
        }
    }, [cameraIsReady]);

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
        .onBegin(() => {
            baseZoom.value = zoom;
            gestureInProgress.current = true;
        })
        .onUpdate((e) => {
            const ZOOM_SENSITIVITY = 0.4; // try values between 0.5 - 1.5
            let delta = (e.scale - 1) * ZOOM_SENSITIVITY;
            let nextZoom = baseZoom.value + delta;
            nextZoom = Math.max(0, Math.min(nextZoom, 1)); // clamp between 0 and 1

            zoomShared.value = nextZoom;
            runOnJS(setZoom)(nextZoom);
        })
        .onEnd(() => {
            gestureInProgress.current = false;
            runOnJS(endZooming)();
        });

    const panGesture = Gesture.Pan()
        .onBegin(() => {
            if (isRecording) {
                baseZoom.value = zoomShared.value;
                gestureInProgress.current = true;
                runOnJS(markZooming)(); // ✅ This is safe and fast
            }
        })
        .onUpdate((e) => {
            if (isRecording) {
                const zoomDelta = -e.translationY / 300;
                let nextZoom = baseZoom.value + zoomDelta;
                nextZoom = Math.max(0, Math.min(nextZoom, 1));

                zoomShared.value = nextZoom;
                runOnJS(setZoom)(nextZoom);
            }
        })
        .onEnd(() => {
            gestureInProgress.current = false;
            runOnJS(endZooming)();
        });

    const takePhoto = async () => {
        try {
            if (!cameraRef.current) return;
            const photo = await cameraRef.current.takePictureAsync();
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

    const handlePressIn = () => {
        wasZoomingRef.current = false;
        pressStartTime.current = Date.now();
        isPressingRef.current = true;
        buttonRecording.current = false;

        setTimeout(() => {
            const heldTime = Date.now() - pressStartTime.current;
            if (isPressingRef.current && heldTime >= MIN_RECORD_DURATION) {
                startRecording();
                buttonRecording.current = true;
            }
        }, MIN_RECORD_DURATION + 10);
    };

    const handlePressOut = () => {
        const heldDuration = Date.now() - pressStartTime.current;
        isPressingRef.current = false;

        if (wasZoomingRef.current) return;

        // ⛔ Skip if flip was triggered mid-record
        if (justFlippedRef.current) {
            justFlippedRef.current = false;
            return;
        }

        if (heldDuration < MIN_RECORD_DURATION) {
            takePhoto();
        } else if (buttonRecording.current) {
            stopRecording();
        }
    };

    const longPressGesture = Gesture.LongPress()
        .minDuration(300)
        .onStart(() => runOnJS(startRecording)())
        .onEnd(() => runOnJS(stopRecording)());

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            runOnJS(toggleCameraFacing)();
        });

    const combinedGesture = Gesture.Simultaneous(
        longPressGesture,
        panGesture,
        pinchGesture,
        doubleTapGesture,
    );

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
                        mode="video"
                        zoom={zoom}
                        enableZoomGesture={false} // we're handling zoom ourselves
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

                    <View
                        style={[styles.captureWrapper, isRecording && styles.recordingBorder]}
                    >
                        <TouchableOpacity
                            style={styles.captureButton}
                            onPressIn={handlePressIn}
                            onPressOut={handlePressOut}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <View style={[styles.recordDot, isRecording && styles.recording]} />
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
        borderWidth: 4,
        borderColor: 'white',
    },
    recordDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'red',
    },
    recording: {
        backgroundColor: '#f00',
        width: 24,
        height: 24,
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
    recordingBorder: {
        borderWidth: 3,
        borderColor: 'red',
        shadowColor: 'red',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 10,
    },
});