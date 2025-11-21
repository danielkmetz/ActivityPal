import React, { useEffect, useMemo, useState } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useSmartVideoPlayer } from '../../utils/useSmartVideoPlayer';
import { useLikeAnimations } from '../../utils/LikeHandlers/LikeAnimationContext';

const TAG = '[VideoThumbnail]';

export default function VideoThumbnail({
  file,
  width,
  height,
  shouldPlay = true,
  postItem,
}) {
  if (!file) {
    console.warn(TAG, 'rendered with no file', { postId: postItem?._id });
    return null;
  };

  console.log(file);

  const { getAnimation, registerAnimation } = useLikeAnimations();
  const [fallbackAnim] = useState(() => new Animated.Value(0));
  const [overlayAnim, setOverlayAnim] = useState(fallbackAnim);

  const player = useSmartVideoPlayer(file, shouldPlay);

  const { status, error } = useEvent(
    player,
    'statusChange',
    { status: player?.status, error: player?.error }
  );

  useEffect(() => {
    if (error) {
      console.error('[VideoThumbnail] player status error', error, {
        postId: postItem?._id,
      });
    }
  }, [error, postItem?._id]);

  useEffect(() => {
    if (status) {
      console.log('[VideoThumbnail] player statusChange', status, {
        postId: postItem?._id,
      });
    }
  }, [status, postItem?._id]);

  useEffect(() => {
    console.log(TAG, 'mount', {
      postId: postItem?._id,
      hasPlayer: !!player,
      hasFile: !!file,
    });
  }, [postItem?._id, player, file]);

  useEffect(() => {
    if (!postItem?._id) return;
    try {
      registerAnimation(postItem._id);
      const anim = getAnimation(postItem._id);
      if (anim) {
        setOverlayAnim(anim);
      } else {
        console.log(TAG, 'no shared animation found for post', postItem._id);
      }
    } catch (err) {
      console.error(TAG, 'error linking like animation', err, {
        postId: postItem._id,
      });
    }
  }, [postItem?._id, getAnimation, registerAnimation]);

  const styleBox = useMemo(
    () => [{ width, height }, styles.thumbBox],
    [width, height]
  );

  // If player failed to create, render a fallback instead of exploding
  if (!player) {
    console.warn(TAG, 'no player instance, rendering fallback', {
      postId: postItem?._id,
      file,
    });
    return (
      <View style={styleBox}>
        <MaterialCommunityIcons name="video-off" size={40} color="#fff" />
      </View>
    );
  }

  return (
    <View style={styleBox}>
      <View style={styles.videoWrapper}>
        <VideoView
          player={player}
          style={styles.video}
          allowsFullscreen={true}
          allowsPictureInPicture={false}
          contentFit="cover"
        />
        {overlayAnim && (
          <Animated.View style={[styles.likeOverlay, { opacity: overlayAnim }]}>
            <MaterialCommunityIcons name="thumb-up" size={80} color="#80E6D2" />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  thumbBox: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoWrapper: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  likeOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -40 }, { translateY: -40 }],
    opacity: 0,
  },
});
