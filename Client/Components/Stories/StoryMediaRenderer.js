import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';

const { width: screenWidth } = Dimensions.get('window');

export default function StoryMediaRenderer(props) {
  const {
    isSharedPost,
    post,
    mediaUri,
    currentSegment,
    mediaType,
    segments = [],
    currentSegmentIndex,
    setCurrentSegmentIndex,
    captions = [],
    isSubmitting,
    imageWithCaptionsRef,
    onPressIn,
    onPressOut,
    isPreview,
    onVideoProgress,
    onVideoEndedLastSegment,
    paused,
  } = props;

  if (isSharedPost && post) {
    const SharedPostStoryContent = require('./SharedPostStoryContent').default;
    return <SharedPostStoryContent post={post} onPressIn={onPressIn} onPressOut={onPressOut} isPreview={isPreview} />;
  }

  const isMulti = mediaType === 'video' && segments.length > 0;
  const sourceUri = isMulti ? currentSegment?.uri : mediaUri;

  // keep latest cb + a token to ignore stale events after source changes
  const onVideoProgressRef = useRef(onVideoProgress);
  useEffect(() => { onVideoProgressRef.current = onVideoProgress; }, [onVideoProgress]);
  const tokenRef = useRef(0);
  useEffect(() => { tokenRef.current += 1; }, [sourceUri]); // bump token whenever the source changes
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const player = useVideoPlayer(
    mediaType === 'video' ? (sourceUri || null) : null,
    (p) => {
      if (!sourceUri) return;
      p.muted = true;
      p.loop = !!isPreview && !isMulti;
      p.timeUpdateEventInterval = 0.05; // ← seconds (≈50ms)
      onVideoProgressRef.current?.(0);
      if (pausedRef.current) p.pause(); else p.play();
    }
  );

  const toSec = (x) => (typeof x === 'number' && x > 1000 ? x / 1000 : (x || 0));

  // Prefer the Expo hook for time updates
  useEventListener(player, 'timeUpdate', (e) => {
    if (pausedRef.current) return;        // don't advance while paused
    report(e?.currentTime, e?.duration);
  });

  const report = (t, d) => {
    if (pausedRef.current) return;
    const myToken = tokenRef.current;
    const tSec = toSec(t);
    const dSec = toSec(d || currentSegment?.duration || 0);
    if (dSec <= 0) return;
    const per = Math.max(0, Math.min(1, tSec / dSec));
    const overall = isMulti ? (currentSegmentIndex + per) / segments.length : per;
    // ignore late events from a previous player/source
    if (myToken !== tokenRef.current) return;
    onVideoProgressRef.current?.(overall);
  };

  // Fallback: poll currentTime/duration (works even if events are quiet)
  useEffect(() => {
    if (!player) return;
    let mounted = true;
    const id = setInterval(() => {
      if (!mounted) return;
      const t = player.currentTime;
      const d = player.duration;
      if (typeof t === 'number' && typeof d === 'number') report(t, d);
    }, 100); // 10fps is plenty for a thin progress bar
    return () => { mounted = false; clearInterval(id); };
  }, [player, isMulti, currentSegmentIndex, segments.length]);

  useEffect(() => {
    if (!player) return;
    const endSub = player.addListener('playToEnd', () => {
      // finish bar visually, but still guard with token
      const myToken = tokenRef.current;
      if (myToken === tokenRef.current) onVideoProgressRef.current?.(1);

      // If it's multi-segment, cycle through segments instead of stopping.
      if (isPreview) {
        if (isMulti) {
          setCurrentSegmentIndex(i => (i + 1) % segments.length);
        }
        return; // don't call onVideoEndedLastSegment in preview
      }

      if (isMulti) {
        if (currentSegmentIndex < segments.length - 1) {
          setCurrentSegmentIndex((i) => i + 1);
        } else {
          onVideoEndedLastSegment?.();
        }
      } else {
        onVideoEndedLastSegment?.();
      }
    });
    return () => endSub.remove();
  }, [player, isMulti, currentSegmentIndex, segments.length]);

  useEffect(() => {
    if (!player) return;
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  if (!sourceUri) return null;

  return (
    <View
      ref={mediaType === 'photo' ? imageWithCaptionsRef : null}
      collapsable={false}
      style={styles.captureContainer}
    >
      {mediaType === 'photo' ? (
        <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <VideoView
          key={sourceUri}
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          allowsFullscreen
          allowsPictureInPicture={false}
          onError={(e) => console.log('📼 Video onError', e?.nativeEvent ?? e)}
          onStatusUpdate={(s) => {
            // Some SDKs emit time here as well
            const t = s?.currentTime;
            const d = s?.duration;
            if (typeof t === 'number' && typeof d === 'number') report(t, d);
          }}
        />
      )}
      {isSubmitting && captions.map((caption, idx) => (
        <View
          key={caption.id ?? idx}
          style={{
            position: 'absolute',
            top: caption.y ?? 100 + 40 * idx,
            left: screenWidth / 2,
            transform: [{ translateX: -screenWidth / 2 }],
            width: '100%',
            alignItems: 'center',
          }}
        >
          <Text style={styles.captionOverlay}>{caption.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  captureContainer: {
    position: 'absolute',
    top: 0, left: 0,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    opacity: 1,
    zIndex: 0,
    backgroundColor: 'black',
    pointerEvents: 'none',
  },
  captionOverlay: {
    fontSize: 24,
    color: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
  },
});
