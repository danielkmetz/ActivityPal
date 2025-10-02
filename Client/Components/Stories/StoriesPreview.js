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

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [composeProgress, setComposeProgress] = useState(0);
  const imageWithCaptionsRef = useRef();

  // 🔤 Font size controls (global + mirrored into each caption)
  const [fontSize, setFontSize] = useState(32);
  const MIN_FONT = 12;
  const MAX_FONT = 64;
  const STEP = 2;

  const applyFontSizeToCaptions = (size) => {
    setCaptions(prev => prev.map(c => ({ ...c, fontSize: size })));
  };

  const incFont = () => {
    setFontSize(prev => {
      const next = Math.min(MAX_FONT, prev + STEP);
      applyFontSizeToCaptions(next);
      return next;
    });
  };

  const decFont = () => {
    setFontSize(prev => {
      const next = Math.max(MIN_FONT, prev - STEP);
      applyFontSizeToCaptions(next);
      return next;
    });
  };

  // Derive banner sizing from font size (same ratios used on native)
  const padding = Math.round(fontSize * 0.6);
  const minBannerHeight = Math.round(fontSize * 1.7);

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

  const createCaption = () => ({
    id: `${Date.now()}`,
    text: '',
    y: SCREEN_HEIGHT * 0.4,
    fontSize, // new captions reflect current size
  });

  const addNewCaption = () => {
    const hasEmptyCaption = captions.some(c => c.text.trim() === '');
    if (hasEmptyCaption) return;
    const newCaption = createCaption();
    setCaptions(prev => [...prev, newCaption]);
    setFocusedCaptionId(newCaption.id);
  };

  // ---- compose using story-composer (passes selected font size) ----
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
      const res = await composeStory({
        debug: true,
        screenWidth: SCREEN_WIDTH,
        fontFamily: 'HelveticaNeue',
        fontWeight: 'regular',
        fontSize,
        padding,
        vPadding: Math.round(fontSize * .1),
        minBannerHeight,
        sideMargin: 0,
        color: '#FFFFFF',
        bgColor: 'rgba(0,0,0,0.55)',
        captions: captions
          .filter(c => c.text.trim())
          .map(c => ({
            text: c.text,
            x: 0.5,
            y: c.y / SCREEN_HEIGHT,
            startMs: 0,
            endMs: 9_999_000,
            fontSize: c.fontSize || fontSize, // per-caption override
            color: '#FFFFFF',
            bgColor: 'rgba(0,0,0,0.55)',
            padding,
            minBannerHeight,
            sideMargin: 0,
          })),
        segments: segs,
        outFileName: `story_${Date.now()}.mp4`,
      });

      if (res?.uri) {
        const info = await FileSystem.getInfoAsync(res.uri, { size: true });
        console.log('🧩 output file info', info);
      }

      return { composed: true, localPath: res?.uri };
    } catch (e) {
      console.error('🧩 compose failed', e);
      throw e;
    } finally {
      sub.remove?.();
      logSub.remove?.();
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
            fontSize: c.fontSize || fontSize, // store chosen size
            backgroundColor: 'rgba(0,0,0,0.55)',
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
          fontSize: c.fontSize || fontSize,
          backgroundColor: 'rgba(0,0,0,0.55)',
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
          {/* Close */}
          <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={40} color="#fff" />
          </TouchableOpacity>
          {/* Add Text (T) */}
          <TouchableOpacity style={styles.captionToggle} onPress={addNewCaption}>
            <Text style={styles.captionToggleText}>T</Text>
          </TouchableOpacity>
          {/* 🔤 Font size controls (below T) */}
          <View style={styles.fontControls}>
            <TouchableOpacity style={styles.fontBtn} onPress={incFont}>
              <Ionicons name="add-circle" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.fontLabel}>{fontSize}</Text>
            <TouchableOpacity style={styles.fontBtn} onPress={decFont}>
              <Ionicons name="remove-circle" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          {/* Caption inputs */}
          {captions.map((caption) => {
            if (!isSubmitting) {
              const size = caption.fontSize || fontSize;
              return (
                <CaptionInput
                  key={`${caption.id}-${size}`}     // force remount on size change
                  caption={caption}
                  fontSize={caption.fontSize || fontSize}                // explicit prop many components use
                  textStyle={{ }}   // common alt prop name
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
              );
            }
          })}
          {/* Post button */}
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
  fontControls: {
    position: 'absolute',
    top: 130,
    right: 15,
    zIndex: 20,
    alignItems: 'center',
    gap: 6,
  },
  fontBtn: {
    padding: 4,
  },
  fontLabel: {
    color: '#fff',
    fontSize: 16,
    marginVertical: 2,
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
