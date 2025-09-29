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
import { postStory, getUploadUrls, postSharedStory } from '../../Slices/StoriesSlice';
import { useNavigation, useRoute } from '@react-navigation/native';
import { selectPrivacySettings } from '../../Slices/UserSlice';
import * as FileSystem from 'expo-file-system';
import CaptionInput from './CaptionInput';
import { burnCaptionsToImage } from '../../utils/burnCaptionsToImages';
import StoryMediaRenderer from './StoryMediaRenderer';
import { getValidPostType } from '../../utils/posts/getValidPostType';
import { compose as composeStory, addProgressListener, addLogListener } from 'story-composer';

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
    const mediaUri = fileParam?.uri;
    const mediaType = fileParam?.mediaType;

    const [captions, setCaptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [focusedCaptionId, setFocusedCaptionId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [composeProgress, setComposeProgress] = useState(0); // optional
    const imageWithCaptionsRef = useRef();

    // ---- helpers & normalized inputs ----
    const normalizeFileUri = (u = '') => {
        if (!u) return u;
        const collapsed = u.replace(/^file:\/+file:\/+/, 'file://');
        return collapsed.replace(/^file:\/{2,}/, 'file:///');
    };

    const normalizedSegments = Array.isArray(segments)
        ? segments.map(s => ({ ...s, uri: normalizeFileUri(s.uri) }))
        : [];

    const effectiveUri = normalizedSegments[0]?.uri || normalizeFileUri(mediaUri);
    const isMultiSegmentVideo = mediaType === 'video' && normalizedSegments.length > 0;

    // fileName must be computed AFTER effectiveUri is known
    const fileName =
        (effectiveUri && effectiveUri.split('/').pop()) ||
        (mediaType === 'photo' ? `story_${Date.now()}.jpg` : `story_${Date.now()}.mp4`);

    // state using normalized segments
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const currentSegment = isMultiSegmentVideo
        ? normalizedSegments[currentSegmentIndex]
        : { uri: effectiveUri };

    const createCaption = () => ({ id: `${Date.now()}`, text: '', y: screenHeight * 0.4 });

    const addNewCaption = () => {
        const hasEmptyCaption = captions.some(c => c.text.trim() === '');
        if (hasEmptyCaption) return;
        const newCaption = createCaption();
        setCaptions(prev => [...prev, newCaption]);
        setFocusedCaptionId(newCaption.id);
    };

    // ---- NEW compose using story-composer ----
    const composeIfNeeded = async () => {
        const isVideo = mediaType === 'video';
        const hasSegments = Array.isArray(normalizedSegments) && normalizedSegments.length > 0;
        const hasCaptions = captions.some(c => c.text.trim().length > 0);
        if (!isVideo) return { composed: false };

        const segs = hasSegments ? normalizedSegments : (effectiveUri ? [{ uri: effectiveUri }] : []);
        if (segs.length <= 1 && !hasCaptions) return { composed: false };

        const sub = addProgressListener(e => {
            if (typeof e?.progress === 'number') setComposeProgress(e.progress);
        });
        const logSub = addLogListener(e => {
            if (e?.message) console.log('🧩 [SC]', e.message);
        });

        try {
            console.log('🧩 composeIfNeeded →', {
                isVideo, hasSegments, hasCaptions,
                seg0: segs[0]?.uri?.slice(0, 80)
            });

            const res = await composeStory({
                debug: true, // 👈 turn on native logs
                segments: segs,
                captions: captions.filter(c => c.text.trim()).map(c => ({
                    text: c.text, x: 0.5, y: c.y / screenHeight,
                    startMs: 0, endMs: 9_999_000, fontSize: 24,
                    color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.5)', padding: 16
                })),
                outFileName: `story_${Date.now()}.mp4`,
            });

            console.log('🧩 compose result', res);

            // Probe the file we’re about to upload
            if (res?.uri) {
                const info = await FileSystem.getInfoAsync(res.uri, { size: true, md5: false });
                console.log('🧩 output file info', info); // { exists, size, uri, modificationTime }
            }

            return { composed: true, localPath: res?.uri };
        } catch (e) {
            console.error('🧩 compose failed', e);
            throw e;
        } finally {
            sub.remove();
            logSub.remove();
            setComposeProgress(0);
        }
    };

    const handlePost = async () => {
        try {
            setIsSubmitting(true);
            setLoading(true);

            const isPhoto = mediaType === 'photo';
            const isVideo = mediaType === 'video';

            // Shared post (no upload)
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

            // If video, compose if needed (merge segments/burn captions)
            let composedResult = { composed: false, localPath: null };
            if (isVideo) {
                composedResult = await composeIfNeeded();
            }

            const sourceUri = composedResult.localPath || effectiveUri;
            const info = await FileSystem.getInfoAsync(sourceUri, { size: true });
            console.log('📦 uploading', { sourceUri, size: info.size });

            // Request a SINGLE upload URL
            const baseFileName = fileName;

            const uploadRes = await dispatch(
                getUploadUrls({
                    mediaType,
                    fileName: baseFileName,
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
                const sourceUri = composedResult.localPath || effectiveUri;
                const put = await FileSystem.uploadAsync(uploadData.uploadUrl, sourceUri, {
                    httpMethod: 'PUT',
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                    headers: { 'Content-Type': 'video/mp4' },
                });
                if (put.status < 200 || put.status >= 300) throw new Error('Upload failed.');
                mediaKey = uploadData.mediaKey;
            }

            // Build payload
            const postPayload = {
                mediaType,
                visibility: contentVisibility || 'public',
                fileName: baseFileName,
                mediaKey,
            };

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

                    {/* Optional: show compose progress */}
                    {isSubmitting && composeProgress > 0 && composeProgress < 1 && (
                        <View style={{ position: 'absolute', bottom: 110, right: 32 }}>
                            <Text style={{ color: '#fff' }}>{Math.round(composeProgress * 100)}%</Text>
                        </View>
                    )}
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
