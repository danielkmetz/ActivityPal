import React from 'react';
import { StyleSheet } from 'react-native';
import { VideoView } from 'expo-video';
import { useSmartVideoPlayer } from '../../utils/useSmartVideoPlayer';

export default function VideoThumbnail({ file, width, height, shouldPlay = true }) {
  if (!file) return null;
  
  const player = useSmartVideoPlayer(file, shouldPlay);
  
  if (!player) return null;

  return (
    <VideoView
      player={player}
      style={[styles.video, { width, height }]}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  video: {
    borderRadius: 8,
    backgroundColor: '#000',
  },
});
