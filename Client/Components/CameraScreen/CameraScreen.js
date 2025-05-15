import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Alert } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const CameraScreen = () => {
    const cameraPermissionResult = useCameraPermissions();
    const [permission, requestPermission] = cameraPermissionResult;
    const [facing, setFacing] = useState("back");
    const [isRecording, setIsRecording] = useState(false);
    const cameraRef = useRef(null);
    const navigation = useNavigation();

    if (!permission) {
        return <View />;
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>We need your permission to access the camera</Text>
                <TouchableOpacity onPress={requestPermission}>
                    <Text style={styles.buttonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const toggleCameraFacing = () => {
        setFacing(prev => (prev === 'back' ? 'front' : 'back'));
    };

    const handleTakePhoto = async () => {
        try {
            if (!cameraRef.current) {
                console.warn('⚠️ cameraRef is null.');
                return;
            }

            const photo = await cameraRef.current.takePictureAsync();
            if (photo?.uri) {
                navigation.navigate('StoryPreview', { file: { ...photo, mediaType: 'image' } });
            }
            if (photo?.uri) {
                navigation.navigate('StoryPreview', { photoUri: photo.uri });
            } else {
                throw new Error('No photo URI returned');
            }
        } catch (err) {
            Alert.alert('Error', 'Failed to take photo');
        }
    };

    const handleRecord = async () => {
        try {
            if (!cameraRef.current) {
                console.warn('⚠️ cameraRef is null.');
                return;
            }

            setIsRecording(true);
            const video = await cameraRef.current.recordAsync({ maxDuration: 15 });
            setIsRecording(false);

            if (video?.uri) {
                navigation.navigate('StoryPreview', { file: { ...video, mediaType: 'video' } });
            } else {
                throw new Error('No video URI returned');
            }
        } catch (err) {
            setIsRecording(false);
            Alert.alert('Error', 'Failed to record video');
        }
    };

    const handleStop = () => {
        if (cameraRef.current && isRecording) {
            cameraRef.current.stopRecording();
        }
    };

    return (
        <View style={styles.container}>
            <CameraView
                style={styles.camera}
                facing={facing}
                ref={cameraRef}
                mode={isRecording ? 'video' : 'picture'}
                enableZoomGesture
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={40} color="#fff" />
            </TouchableOpacity>

            <View style={styles.controls}>
                <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
                    <Ionicons name="camera-reverse" size={28} color="#fff" />
                </TouchableOpacity>

                <View style={[styles.captureWrapper, isRecording && styles.recordingBorder]}>
                    <TouchableOpacity
                        style={styles.captureButton}
                        onPress={handleTakePhoto}
                        onLongPress={handleRecord}
                        onPressOut={handleStop}
                        delayLongPress={200}
                    >
                        <View style={[styles.recordDot, isRecording && styles.recording]} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
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
        elevation: 10, // For Android glow
    },


});
