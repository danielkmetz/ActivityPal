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
import { postStory } from '../../Slices/StoriesSlice';
import { useNavigation, useRoute } from '@react-navigation/native';
import { selectUser, selectPrivacySettings } from '../../Slices/UserSlice';
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const StoryPreview = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const privacySettings = useSelector(selectPrivacySettings);
    const contentVisibility = privacySettings?.contentVisibility;

    const { file } = route.params;
    const mediaUri = file?.uri;
    const mediaType = file?.mediaType;
    const [caption, setCaption] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRetake = () => {
        navigation.goBack(); // Return to camera
    };

    const handlePost = async () => {
        try {
            setLoading(true);
            console.log("🚀 Starting story post process...");
            console.log("🧾 mediaUri:", mediaUri);
            console.log("🧾 mediaType:", mediaType);
            console.log("🧾 caption:", caption);
            console.log("🧾 contentVisibility:", contentVisibility);

            const fileName = mediaUri.split('/').pop();
            console.log("📦 Extracted fileName:", fileName);

            // Step 1: Register the story and get presigned URL
            const res = await dispatch(
                postStory({
                    fileName,
                    mediaType,
                    caption,
                    visibility: contentVisibility,
                })
            );

            console.log("📨 postStory response:", res);

            if (!postStory.fulfilled.match(res)) {
                console.error("❌ postStory rejected:", res);
                throw new Error(res.payload || 'Failed to create story record.');
            }

            const { mediaUploadUrl } = res.payload;
            console.log("🔗 Received mediaUploadUrl:", mediaUploadUrl);

            // Step 2: Upload file directly to S3
            const uploadTargetUri = mediaUri; // Use mediaUri instead of videoUri
            console.log("📤 Uploading file:", uploadTargetUri);

            const uploadRes = await FileSystem.uploadAsync(mediaUploadUrl, uploadTargetUri, {
                httpMethod: 'PUT',
                uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                headers: {
                    'Content-Type': mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
                },
            });

            console.log("✅ S3 Upload Response:", uploadRes);

            if (uploadRes.status !== 200) {
                console.error("❌ Upload failed with status:", uploadRes.status);
                throw new Error('Upload failed. Please try again.');
            }

            Alert.alert('Success', 'Your story has been posted!');
            navigation.navigate('TabNavigator', { screen: 'Home' });
        } catch (err) {
            console.error('❌ Error posting story:', err);
            Alert.alert('Error', err.message || 'Something went wrong.');
        } finally {
            setLoading(false);
            console.log("🔚 Story post process ended.");
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.video}>
                {mediaType === 'video' ? (
                    <Video
                        source={{ uri: file.uri }}
                        shouldPlay
                        isLooping
                        isMuted
                        resizeMode="cover"
                        useNativeControls
                        style={StyleSheet.absoluteFill}
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
