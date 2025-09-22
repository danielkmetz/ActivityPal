import React from 'react';
import { View, Image, Text } from 'react-native';
import { VideoView } from 'expo-video';
import styles from '../styles';

export default function Media({ isVideo, player, imageUrl, placeholder = '🖼️' }) {
  if (isVideo) {
    return (
      <VideoView
        player={player}
        style={styles.media}
        allowsPictureInPicture
        nativeControls={false}
        contentFit="cover"
      />
    );
  }

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={styles.media} resizeMode="cover" />;
  }

  return (
    <View style={[styles.media, styles.placeholder]}>
      <Text style={styles.placeholderEmoji}>{placeholder}</Text>
    </View>
  );
}
