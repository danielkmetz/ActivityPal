import React, { useMemo, useRef } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { Video } from 'expo-av';
import SharedPostStoryContent from './SharedPostStoryContent';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function StoryMediaRenderer({
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
}) {
  if (isSharedPost && post) {
    return (
      <SharedPostStoryContent
        post={post}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        isPreview={isPreview}
      />
    );
  }

  const isMulti = mediaType === 'video' && Array.isArray(segments) && segments.length > 0;
  const sourceUri = isMulti ? currentSegment?.uri : mediaUri;

  if (!sourceUri) return null;

  // Force remount when the URI changes so the player truly reloads the new clip
  const videoKey = useMemo(
    () => `${sourceUri}#${isMulti ? currentSegmentIndex : 'single'}`,
    [sourceUri, isMulti, currentSegmentIndex]
  );

  return (
    <View
      ref={mediaType === 'photo' ? imageWithCaptionsRef : null}
      collapsable={false}
      style={styles.captureContainer}
    >
      {mediaType === 'photo' ? (
        <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={styles.video}>
          <Video
            key={videoKey}
            source={{ uri: sourceUri }}
            shouldPlay
            isLooping={isMulti ? false : true}          // ⟵ don't loop when using segments
            isMuted
            resizeMode="cover"
            useNativeControls={false}
            style={StyleSheet.absoluteFill}
            progressUpdateIntervalMillis={250}
            onPlaybackStatusUpdate={(s) => {
              if (!s?.isLoaded) return;

              // Advance only when the current clip actually finished
              if (s.didJustFinish) {
                if (isMulti) {
                  if (currentSegmentIndex < segments.length - 1) {
                    setCurrentSegmentIndex((prev) => prev + 1); // go to next segment
                  } else {
                    // Reached last segment — choose your behavior:
                    // (a) loop back to start:
                    setCurrentSegmentIndex(0);
                    // (b) or stop on last clip: do nothing
                  }
                }
                // Single video: if you set isLooping=true, it will loop automatically.
              }
            }}
            onError={(e) => {
              console.log('Video error:', e);
            }}
          />
        </View>
      )}

      {isSubmitting &&
        captions.map((caption, index) => (
          <View
            key={caption.id}
            style={{
              position: 'absolute',
              top: caption.y ?? 100 + 40 * index,
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
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  captureContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    opacity: 1,
    zIndex: -1,
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
