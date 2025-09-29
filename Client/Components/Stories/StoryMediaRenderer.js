import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

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
  } = props;

  if (isSharedPost && post) {
    const SharedPostStoryContent = require('./SharedPostStoryContent').default;
    return <SharedPostStoryContent post={post} onPressIn={onPressIn} onPressOut={onPressOut} isPreview={isPreview} />;
  }

  const isMulti = mediaType === 'video' && Array.isArray(segments) && segments.length > 0;
  const sourceUri = isMulti ? currentSegment?.uri : mediaUri;
  const isRemote = typeof sourceUri === 'string' && /^https?:\/\//i.test(sourceUri || '');
  const [headInfo, setHeadInfo] = useState(null);

  // Preflight for remote URLs (same logic you already had)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isRemote || !sourceUri) return;
      try {
        const ctrl = new AbortController();
        const r = await fetch(sourceUri, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' }, // probe just 1 byte
          cache: 'no-store',
          signal: ctrl.signal,
        });
        const info = {
          ok: r.ok,
          status: r.status,                       // expect 206
          contentRange: r.headers.get('content-range'),
          acceptRanges: r.headers.get('accept-ranges'), // expect "bytes"
          contentType: r.headers.get('content-type'),   // expect "video/mp4"
        };
        if (!cancelled) setHeadInfo(info);
        console.log('🎯 RANGE probe', info);
      } catch (e) {
        if (!cancelled) setHeadInfo({ ok: false, error: String(e) });
        console.log('🎯 RANGE probe failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [sourceUri, isRemote]);

  // (Re)create a player when the URI changes
  const player = useVideoPlayer(sourceUri || null, (p) => {
    if (!sourceUri) return;
    p.muted = true;
    p.loop = !isMulti;    // loop only for single video
    p.play();
  });

  // Segment advancing
  useEffect(() => {
    if (!isMulti) return;
    const sub = player.addListener('playToEnd', () => {
      if (currentSegmentIndex < segments.length - 1) {
        setCurrentSegmentIndex((i) => i + 1);
      } else {
        setCurrentSegmentIndex(0); // loop segments
      }
    });
    return () => sub.remove();
  }, [isMulti, player, currentSegmentIndex, segments.length, setCurrentSegmentIndex]);

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
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          onLoadStart={() => console.log('📺 onLoadStart', { uri: sourceUri })}
          onError={(e) => {
            console.log('📼 Video onError', e?.nativeEvent ?? e);
            if (isRemote) {
              console.log('⚠️ Remote video error. Check: HTTPS, fresh presigned URL, Accept-Ranges=bytes, Content-Type=video/mp4.');
              console.log('HEAD result was:', headInfo);
            }
          }}
          onStatusUpdate={(status) => {
            // status.playbackState, duration, currentTime, etc.
            // console.log('status', status);
          }}
        />
      )}

      {isSubmitting && captions.map((caption, idx) => (
        <View
          key={caption.id}
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
    zIndex: 0, // keep >=0 so it’s visible
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
