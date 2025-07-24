import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Dimensions,
    TouchableWithoutFeedback,
    Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { postStory, getUploadUrls } from '../../Slices/StoriesSlice';
import { useNavigation, useRoute } from '@react-navigation/native';
import { selectPrivacySettings } from '../../Slices/UserSlice';
import * as FileSystem from 'expo-file-system';
import CaptionInput from './CaptionInput';
import { burnCaptionsToImage } from '../../utils/burnCaptionsToImages';
import StoryMediaRenderer from './StoryMediaRenderer';
import { postSharedStory } from '../../Slices/StoriesSlice';

const screenHeight = Dimensions.get('window').height;

const StoryPreview = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const privacySettings = useSelector(selectPrivacySettings);
    const contentVisibility = privacySettings?.contentVisibility;
    const { file: fileParam = {}, post } = route.params || {};
    const postType = post?.type;
    const originalPostId = post?._id;
    const isSharedPost = !!postType && !!originalPostId;
    const segments = fileParam?.segments;
    const file = fileParam;
    const mediaUri = file?.uri;
    const mediaType = fileParam?.mediaType;
    const isMultiSegmentVideo = mediaType === 'video' && Array.isArray(file?.segments);
    const effectiveUri = isMultiSegmentVideo && file.segments.length > 0
        ? file.segments[0].uri
        : file?.uri;
    const fileName = effectiveUri ? effectiveUri.split('/').pop() : `story_${Date.now()}.mp4`;

    const [captions, setCaptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const [focusedCaptionId, setFocusedCaptionId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const currentSegment = segments?.[currentSegmentIndex] || file;
    const imageWithCaptionsRef = useRef();

    const createCaption = () => ({ id: `${Date.now()}`, text: '', y: screenHeight * 0.4 });

    //console.log(post);

    const addNewCaption = () => {
        const hasEmptyCaption = captions.some(c => c.text.trim() === '');
        if (hasEmptyCaption) return; // Don't add another empty one

        const newCaption = createCaption();
        setCaptions(prev => [...prev, newCaption]);
        setFocusedCaptionId(newCaption.id);
    };

    const handlePost = async () => {
        try {
            console.log('🚀 handlePost: started');
            setIsSubmitting(true);
            setLoading(true);

            const isMultiPartVideo = mediaType === 'video' && Array.isArray(file?.segments);
            const isPhoto = mediaType === 'photo';

            if (isSharedPost) {
                // Use the shared post thunk
                const sharedRes = await dispatch(postSharedStory({
                    postType,
                    originalPostId,
                    caption: captions.length > 0 ? captions[0].text : '', // use first caption if available
                    visibility: contentVisibility || 'public',
                }));

                if (!postSharedStory.fulfilled.match(sharedRes)) {
                    throw new Error(sharedRes.payload || 'Failed to share post to story');
                }

                Alert.alert('Success', 'Your story has been posted!');
                navigation.navigate('TabNavigator', { screen: 'Home' });
                return;
            }

            console.log('🔍 isPhoto:', isPhoto);
            console.log('🔍 isMultiPartVideo:', isMultiPartVideo);

            const uploadRes = await dispatch(
                getUploadUrls({
                    mediaType,
                    fileName: isPhoto ? fileName : undefined,
                    fileNames: isMultiPartVideo
                        ? file.segments.map((_, i) => `${fileName}_seg${i}.mp4`)
                        : undefined,
                })
            );

            if (!getUploadUrls.fulfilled.match(uploadRes)) {
                console.error('❌ Failed to get upload URLs:', uploadRes.payload);
                throw new Error(uploadRes.payload || 'Failed to get upload URL(s)');
            }

            const { uploadData } = uploadRes.payload;
            const { mediaKey } = uploadData;

            if (isPhoto) {
                let finalUploadUri = mediaUri;

                if (captions.length > 0 && imageWithCaptionsRef.current) {
                    console.log('🖊️ Burning captions into image...');
                    await new Promise(resolve => setTimeout(resolve, 300)); // Add delay
                    finalUploadUri = await burnCaptionsToImage(imageWithCaptionsRef.current);
                }

                const uploadResult = await FileSystem.uploadAsync(uploadData.uploadUrl, finalUploadUri, {
                    httpMethod: 'PUT',
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                    headers: { 'Content-Type': 'image/jpeg' },
                });

                if (uploadResult.status !== 200) {
                    throw new Error('Upload failed. Please try again.');
                }
            }

            if (isMultiPartVideo) {
                if (!Array.isArray(uploadData)) {
                    throw new Error('Upload data for segments is missing or malformed.');
                }

                for (let i = 0; i < uploadData.length; i++) {
                    const segment = uploadData[i];
                    const localSegment = file.segments[i];

                    const uploadResult = await FileSystem.uploadAsync(segment.uploadUrl, localSegment.uri, {
                        httpMethod: 'PUT',
                        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                        headers: { 'Content-Type': 'video/mp4' },
                    });

                    if (uploadResult.status !== 200) {
                        throw new Error(`Upload failed for segment ${i + 1}`);
                    }

                    file.segments[i] = {
                        ...localSegment,
                        mediaKey: segment.mediaKey,
                    };
                }
            }

            const postPayload = {
                mediaType,
                visibility: contentVisibility,
                fileName,
            };

            if (isPhoto && mediaKey) {
                postPayload.mediaKey = mediaKey;
            }

            if (isMultiPartVideo) {
                postPayload.segments = file.segments.map(({ mediaKey }) => ({ mediaKey }));
            }

            if (captions.length > 0) {
                postPayload.captions = captions.map(c => ({
                    text: c.text,
                    y: c.y,
                    fontSize: 24,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    width: Dimensions.get('window').width,
                }));
            }

            console.log('📤 Posting final story:', postPayload);

            const postRes = await dispatch(postStory(postPayload));
            if (!postStory.fulfilled.match(postRes)) {
                throw new Error(postRes.payload || 'Failed to post story');
            }

            Alert.alert('Success', 'Your story has been posted!');
            navigation.navigate('TabNavigator', { screen: 'Home' });

        } catch (err) {
            console.error('❌ handlePost error:', err);
            Alert.alert('Error', err.message || 'Something went wrong.');
        } finally {
            console.log('✅ handlePost: finished');
            setIsSubmitting(false);
            setLoading(false);
        }
    };

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () =>
            setKeyboardVisible(true)
        );
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardVisible(false);

            // If any caption is empty and focused, remove it
            setCaptions(prev => {
                const focusedCaption = prev.find(c => c.id === focusedCaptionId);
                if (focusedCaption && focusedCaption.text.trim() === '') {
                    setFocusedCaptionId(null);
                    return prev.filter(c => c.id !== focusedCaptionId);
                }
                return prev;
            });
        });

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, [focusedCaptionId]);

    return (
        <View style={{ flex: 1 }}>
            <TouchableWithoutFeedback
                onPress={() => {
                    Keyboard.dismiss();
                    if (!keyboardVisible) {
                        addNewCaption();
                    }
                }}
            >
                <View style={styles.container}>
                    <StoryMediaRenderer
                        isSharedPost={isSharedPost}
                        post={post}
                        mediaUri={mediaUri}
                        currentSegment={currentSegment}
                        mediaType={mediaType}
                        segments={segments}
                        currentSegmentIndex={currentSegmentIndex}
                        setCurrentSegmentIndex={setCurrentSegmentIndex}
                        captions={captions}
                        isSubmitting={isSubmitting}
                        imageWithCaptionsRef={imageWithCaptionsRef}
                    />
                    <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                        <Ionicons name="close" size={40} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.captionToggle} onPress={addNewCaption}>
                        <Text style={styles.captionToggleText}>T</Text>
                    </TouchableOpacity>
                    {captions.map((caption) => {
                        if (!isSubmitting) {
                            return (
                                <CaptionInput
                                    key={caption.id}
                                    caption={caption}
                                    onChange={(text) =>
                                        setCaptions((prev) =>
                                            prev.map((c) => (c.id === caption.id ? { ...c, text } : c))
                                        )
                                    }
                                    onFocus={() => setFocusedCaptionId(caption.id)}
                                    onBlur={() => {
                                        if (caption.text.trim() === '') {
                                            setCaptions((prev) => prev.filter((c) => c.id !== caption.id));
                                        }
                                    }}
                                    onDragEnd={(id, newY) => {
                                        setCaptions(prev =>
                                            prev.map(c =>
                                                c.id === id ? { ...c, y: newY } : c
                                            )
                                        );
                                    }}
                                />
                            )
                        }
                    })}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={styles.snapPostButton}
                            onPress={handlePost}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Ionicons name="arrow-forward-circle" size={54} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableWithoutFeedback>
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
    closeButton: {
        position: 'absolute',
        top: 60,
        left: 20,
        zIndex: 10,
        padding: 8,
    },
    captionToggle: {
        position: 'absolute',
        top: 70,
        right: 25,
        zIndex: 20,
    },
    captionToggleText: {
        color: '#fff',
        fontSize: 30,
        fontWeight: 'bold',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    snapPostButton: {
        position: 'absolute',
        bottom: 40,
        right: 25,
        zIndex: 20,
    },
});
