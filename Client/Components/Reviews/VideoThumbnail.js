import React, { useEffect, useMemo, useState } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView } from 'expo-video';
import { useSmartVideoPlayer } from '../../utils/useSmartVideoPlayer';
import { useLikeAnimations } from '../../utils/LikeHandlers/LikeAnimationContext';

export default function VideoThumbnail({
  file,
  width,
  height,
  shouldPlay = true,
  postItem,           // used only to look up the shared Animated.Value by _id
}) {
  if (!file) return null;

  const { getAnimation, registerAnimation } = useLikeAnimations();
  const [fallbackAnim] = useState(() => new Animated.Value(0));
  const [overlayAnim, setOverlayAnim] = useState(fallbackAnim);

  const player = useSmartVideoPlayer(file, shouldPlay);

  useEffect(() => {
    if (!postItem?._id) return;
    registerAnimation(postItem._id);
    const anim = getAnimation(postItem._id);
    if (anim) setOverlayAnim(anim);
  }, [postItem?._id, getAnimation, registerAnimation]);

  const styleBox = useMemo(
    () => [{ width, height }, styles.thumbBox],
    [width, height]
  );

  if (!player) return null;

  return (
    <View style={styleBox}>
      <View style={styles.videoWrapper}>
        <VideoView
          player={player}
          style={styles.video}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          contentFit="cover"
        />

        {/* Thumbs-up overlay driven externally (no tap logic here) */}
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
