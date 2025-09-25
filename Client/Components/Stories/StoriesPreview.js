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
import { getValidPostType } from '../../utils/posts/getValidPostType';
import { composeOnePassNoList } from '../CameraScreen/videoCompose';

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
    const fileName = effectiveUri ? effectiveUri.split('/').pop() : `story_${Date.now()}.mp4`;

    const [captions, setCaptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [focusedCaptionId, setFocusedCaptionId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const imageWithCaptionsRef = useRef();

    const normalizeFileUri = (u = '') => {
        if (!u) return u;
        // collapse 'file://file:///...' to 'file:///'
        const collapsed = u.replace(/^file:\/+file:\/+/, 'file://');
        // ensure exactly three slashes after scheme
        return collapsed.replace(/^file:\/{2,}/, 'file:///');
    };

    const normalizedSegments = Array.isArray(segments)
        ? segments.map(s => ({ ...s, uri: normalizeFileUri(s.uri) }))
        : [];

    const effectiveUri = normalizedSegments[0]?.uri || normalizeFileUri(fileParam?.uri);
    const isMultiSegmentVideo =
        mediaType === 'video' && normalizedSegments.length > 0;

    // state using normalized segments
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const currentSegment = isMultiSegmentVideo
        ? normalizedSegments[currentSegmentIndex]
        : { uri: effectiveUri };

    const createCaption = () => ({ id: `${Date.now()}`, text: '', y: screenHeight * 0.4 });

    const addNewCaption = () => {
        const hasEmptyCaption = captions.some(c => c.text.trim() === '');
        if (hasEmptyCaption) return; // Don't add another empty one

        const newCaption = createCaption();
        setCaptions(prev => [...prev, newCaption]);
        setFocusedCaptionId(newCaption.id);
    };

    const composeIfNeeded = async () => {
        const isVideo = mediaType === 'video';
        const hasSegments = Array.isArray(normalizedSegments) && normalizedSegments.length > 0;
        const hasCaptions = captions.some(c => c.text.trim().length > 0);

        if (!isVideo) return { composed: false };

        // Build the input list for ffmpeg – if you only have a single file, treat it like 1 segment.
        const segsForFfmpeg = hasSegments
            ? normalizedSegments
            : effectiveUri
                ? [{ uri: effectiveUri }]
                : [];

        // If either multiple segments OR you want to burn captions into video → compose.
        if (segsForFfmpeg.length > 1 || hasCaptions) {
            // Map your caption objects to ffmpeg captions; use ratio-based y so it matches preview dragging.
            const ffmpegCaptions = captions
                .filter(c => c.text.trim().length)
                .map(c => ({
                    text: c.text,
                    // center x; if you later support horizontal drag, pass x as an expression
                    x: '(w-text_w)/2',
                    // we’ll map screen Y to video Y inside the helper via screenHeight
                    y, // optional, you can omit and rely on yExpr mapping using screenHeight
                    start: 0,
                    end: 9999,
                    fontSize: 24,
                    color: '#ffffff',
                    boxcolor: 'black@0.5',
                    boxborderw: 16,
                    yExpr: null, // let helper compute from c.y + screenHeight
                    // keep the raw pixel so helper can compute ratio:
                    y: c.y
                }));

            const outPath = await composeOnePassNoList(segsForFfmpeg, {
                captions: ffmpegCaptions,
                screenHeight, // from Dimensions.get('window').height already in your file
                // Optional: override fontfile if you ship one with your app
                // fontfile: `${FileSystem.documentDirectory}MyFont.ttf`,
                preset: 'veryfast',
                crf: 20,
            });

            return { composed: true, localPath: `file://${outPath}` };
        }

        return { composed: false };
    };

    const handlePost = async () => {
        try {
            setIsSubmitting(true);
            setLoading(true);

            const isPhoto = mediaType === 'photo';
            const isVideo = mediaType === 'video';

            // Shared post flow (no upload)
            if (isSharedPost) {
                const derivedPostType = getValidPostType(post);
                const sharedPayload = {
                    postType: derivedPostType,
                    originalPostId,
                    captions: captions.map(c => ({
                        text: c.text,
                        y: c.y,
                        fontSize: 24,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        color: '#fff',
                        width: Dimensions.get('window').width,
                    })),
                    visibility: contentVisibility || 'public',
                };

                const sharedRes = await dispatch(postSharedStory(sharedPayload));
                if (!postSharedStory.fulfilled.match(sharedRes)) {
                    throw new Error(sharedRes.payload || 'Failed to share post to story');
                }

                Alert.alert('Success', 'Your story has been posted!');
                navigation.navigate('TabNavigator', { screen: 'Home' });
                return;
            }

            // If video, compose if needed (merge segments and/or burn captions)
            let composedResult = { composed: false, localPath: null };
            if (isVideo) {
                // composeIfNeeded should return { composed: true/false, localPath: 'file://...' }
                composedResult = await composeIfNeeded();
            }

            // Request a SINGLE upload URL (photo OR video)
            const baseFileName =
                fileName || (isPhoto ? `story_${Date.now()}.jpg` : `story_${Date.now()}.mp4`);

            const uploadRes = await dispatch(
                getUploadUrls({
                    mediaType,
                    fileName: baseFileName, // always one file now
                })
            );
            if (!getUploadUrls.fulfilled.match(uploadRes)) {
                throw new Error(uploadRes.payload || 'Failed to get upload URL');
            }
            const { uploadData } = uploadRes.payload; // { uploadUrl, mediaKey }

            // Upload the media
            let mediaKey = null;

            if (isPhoto) {
                let finalUploadUri = mediaUri;
                if (captions.length > 0 && imageWithCaptionsRef.current) {
                    // Burn captions into the image snapshot
                    await new Promise(r => setTimeout(r, 300));
                    finalUploadUri = await burnCaptionsToImage(imageWithCaptionsRef.current);
                }

                const put = await FileSystem.uploadAsync(uploadData.uploadUrl, finalUploadUri, {
                    httpMethod: 'PUT',
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                    headers: { 'Content-Type': 'image/jpeg' },
                });
                if (put.status < 200 || put.status >= 300) throw new Error('Upload failed.');
                mediaKey = uploadData.mediaKey;
            } else if (isVideo) {
                const sourceUri = composedResult.localPath || effectiveUri; // composed or original single-clip
                const put = await FileSystem.uploadAsync(uploadData.uploadUrl, sourceUri, {
                    httpMethod: 'PUT',
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                    headers: { 'Content-Type': 'video/mp4' },
                });
                if (put.status < 200 || put.status >= 300) throw new Error('Upload failed.');
                mediaKey = uploadData.mediaKey;
            }

            // Build payload for story creation (single mediaKey; no segments for video)
            const postPayload = {
                mediaType,
                visibility: contentVisibility || 'public',
                fileName: baseFileName,
                mediaKey,
            };

            // Keep captions metadata only for photos (video captions are burned in)
            if (isPhoto && captions.length > 0) {
                postPayload.captions = captions.map(c => ({
                    text: c.text,
                    y: c.y,
                    fontSize: 24,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    width: Dimensions.get('window').width,
                }));
            }

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
                        mediaUri={effectiveUri}
                        currentSegment={currentSegment}
                        mediaType={mediaType}
                        segments={normalizedSegments}
                        currentSegmentIndex={currentSegmentIndex}
                        setCurrentSegmentIndex={setCurrentSegmentIndex}
                        captions={captions}
                        isSubmitting={isSubmitting}
                        imageWithCaptionsRef={imageWithCaptionsRef}
                        isPreview={true}
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
