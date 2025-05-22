import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Image,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { postStory, getUploadUrls } from '../../Slices/StoriesSlice';
import { useNavigation, useRoute } from '@react-navigation/native';
import { selectPrivacySettings } from '../../Slices/UserSlice';
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const StoryPreview = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const privacySettings = useSelector(selectPrivacySettings);
    const contentVisibility = privacySettings?.contentVisibility;

    const { file: fileParam } = route.params;
    const segments = fileParam?.segments;
    const file = fileParam;
    const mediaUri = file?.uri;
    const mediaType = fileParam?.mediaType;
    const isMultiSegmentVideo = mediaType === 'video' && Array.isArray(file?.segments);
    const effectiveUri = isMultiSegmentVideo ? file.segments[0]?.uri : file?.uri;
    const fileName = effectiveUri
        ? effectiveUri.split('/').pop()
        : `story_${Date.now()}.mp4`; // fallback for edge cases
    const [caption, setCaption] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const currentSegment = segments?.[currentSegmentIndex] || file;

    const handlePlaybackStatusUpdate = (status) => {
        if (status.didJustFinish) {
            if (segments && currentSegmentIndex < segments.length - 1) {
                setCurrentSegmentIndex(prev => prev + 1);
            } else {
                // Optionally loop
                setCurrentSegmentIndex(0);
            }
        }
    };

    const handleRetake = () => {
        navigation.goBack(); // Return to camera
    };

    const handlePost = async () => {
        try {
            setLoading(true);

            const isMultiPartVideo = mediaType === 'video' && Array.isArray(file?.segments);
            const isPhoto = mediaType === 'photo';

            console.log('📤 Starting handlePost...');
            console.log('📝 mediaType:', mediaType);
            console.log('📝 isPhoto:', isPhoto);
            console.log('📝 isMultiPartVideo:', isMultiPartVideo);

            // 1️⃣ Generate presigned upload URL(s)
            console.log('📡 Requesting presigned upload URL(s)...');
            const uploadRes = await dispatch(
                getUploadUrls({
                    mediaType,
                    fileName: isPhoto ? fileName : undefined,
                    fileNames: isMultiPartVideo
                        ? file.segments.map((_, i) => `${fileName}_seg${i}.mp4`)
                        : undefined,
                })
            );

            console.log('upload response', uploadRes)

            if (!getUploadUrls.fulfilled.match(uploadRes)) {
                console.error('❌ Failed to get upload URLs:', uploadRes.payload);
                throw new Error(uploadRes.payload || 'Failed to get upload URL(s)');
            }

            const { uploadData, mediaKey } = uploadRes.payload;

            if (isPhoto) {
                console.log('📤 Uploading photo...');
                const uploadResult = await FileSystem.uploadAsync(uploadData[0].uploadUrl, mediaUri, {
                    httpMethod: 'PUT',
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                    headers: {
                        'Content-Type': 'image/jpeg',
                    },
                });

                if (uploadResult.status !== 200) {
                    console.error('❌ Photo upload failed:', uploadResult);
                    throw new Error('Upload failed. Please try again.');
                }

                console.log('✅ Photo uploaded successfully.');
            }

            if (isMultiPartVideo) {
                if (!Array.isArray(uploadData)) {
                    throw new Error('Upload data for segments is missing or malformed.');
                }

                console.log(`📤 Uploading ${uploadData.length} video segments...`);
                for (let i = 0; i < uploadData.length; i++) {
                    const segment = uploadData[i];
                    const localSegment = file.segments[i];

                    console.log(`⏫ Uploading segment ${i + 1}: ${localSegment.uri}`);
                    const uploadResult = await FileSystem.uploadAsync(segment.uploadUrl, localSegment.uri, {
                        httpMethod: 'PUT',
                        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                        headers: {
                            'Content-Type': 'video/mp4',
                        },
                    });

                    if (uploadResult.status !== 200) {
                        console.error(`❌ Upload failed for segment ${i + 1}:`, uploadResult);
                        throw new Error(`Upload failed for segment ${i + 1}`);
                    }

                    console.log(`✅ Segment ${i + 1} uploaded.`);

                    // Replace local uri with mediaKey for submission
                    file.segments[i] = {
                        ...localSegment,
                        mediaKey: segment.mediaKey,
                    };
                }
            }

            // 3️⃣ Submit final metadata to backend
            const postPayload = {
                mediaType,
                caption,
                visibility: contentVisibility,
                fileName,
            };

            if (isPhoto && mediaKey) {
                postPayload.mediaKey = mediaKey;
            }

            if (isMultiPartVideo) {
                postPayload.segments = file.segments.map(({ mediaKey }) => ({ mediaKey }));
            }

            console.log('📨 Submitting postStory payload:', postPayload);
            const postRes = await dispatch(postStory(postPayload));

            if (!postStory.fulfilled.match(postRes)) {
                console.error('❌ postStory failed:', postRes.payload);
                throw new Error(postRes.payload || 'Failed to post story');
            }

            console.log('✅ Story posted successfully.');
            Alert.alert('Success', 'Your story has been posted!');
            navigation.navigate('TabNavigator', { screen: 'Home' });

        } catch (err) {
            console.error('❌ Error in handlePost:', err.message);
            Alert.alert('Error', err.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.video}>
                {mediaType === 'video' ? (
                    <Video
                        source={{ uri: currentSegment.uri }}
                        shouldPlay
                        isLooping
                        isMuted
                        resizeMode="cover"
                        useNativeControls={false}
                        style={StyleSheet.absoluteFill}
                        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                    />
                ) : (
                    <Image
                        source={{ uri: mediaUri }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                    />
                )}
            </View>

            <TextInput
                style={styles.captionInput}
                placeholder="Write a caption..."
                placeholderTextColor="#999"
                value={caption}
                onChangeText={setCaption}
            />

            <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
                    <Text style={styles.buttonText}>Retake</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.postButton} onPress={handlePost} disabled={loading}>
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Post Story</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default StoryPreview;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'flex-end',
        paddingBottom: 30,
    },
    video: {
        ...StyleSheet.absoluteFillObject,
    },
    captionInput: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        color: '#fff',
        padding: 10,
        margin: 15,
        borderRadius: 8,
        fontSize: 16,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    postButton: {
        backgroundColor: '#1e90ff',
        padding: 12,
        borderRadius: 6,
        minWidth: 100,
        alignItems: 'center',
    },
    retakeButton: {
        backgroundColor: '#555',
        padding: 12,
        borderRadius: 6,
        minWidth: 100,
        alignItems: 'center',
    },
    buttonText: {
        color: '#fff',
        fontWeight: '600',
    },
});
