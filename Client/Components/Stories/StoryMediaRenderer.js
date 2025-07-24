import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { Video } from 'expo-av';
import PostPreview from '../DirectMessages/PostPreview';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const StoryMediaRenderer = ({
  isSharedPost,
  post,
  mediaUri,
  currentSegment,
  mediaType,
  segments,
  currentSegmentIndex,
  setCurrentSegmentIndex,
  captions,
  isSubmitting,
  imageWithCaptionsRef,
}) => {
  if (isSharedPost && post) {
    return (
      <View style={styles.sharedWrapper}>
        <PostPreview
          postPreview={{
            ...post,
            mediaType: post.photos?.length > 0 ? 'image' : 'video',
            mediaUrl: post.photos?.[0]?.url || post.video?.url,
            postType: post.type,
          }}
          width={screenWidth - 32}
          height={screenHeight * .5}
          showOverlay={true}
          showPostText={true}
        />
      </View>
    );
  }

  if (!(mediaUri || currentSegment?.uri)) return null;

  return (
    <View
      ref={mediaType === 'photo' ? imageWithCaptionsRef : null}
      collapsable={false}
      style={styles.captureContainer}
    >
      {mediaType === 'photo' ? (
        <Image
          source={{ uri: mediaUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.video}>
          <Video
            source={{ uri: currentSegment?.uri }}
            shouldPlay
            isLooping
            isMuted
            resizeMode="cover"
            useNativeControls={false}
            style={StyleSheet.absoluteFill}
            onPlaybackStatusUpdate={({ didJustFinish }) => {
              if (
                didJustFinish &&
                Array.isArray(segments) &&
                currentSegmentIndex < segments.length - 1
              ) {
                setCurrentSegmentIndex(prev => prev + 1);
              } else {
                setCurrentSegmentIndex(0);
              }
            }}
          />
        </View>
      )}

      {isSubmitting && captions.map((caption, index) => (
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
};

export default StoryMediaRenderer;

const styles = StyleSheet.create({
  sharedWrapper: {
    padding: 16,
    bottom: '20%',
  },
  label: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
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
