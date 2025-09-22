import React from 'react';
import { View, Text, Image } from 'react-native';
import { VideoView } from 'expo-video';
import Header from '../parts/Header';
import styles from '../styles';

export default function SharedPosts({
  avatarUri,
  primary,
  secondary,
  isVideo,
  player,
  mediaUrl,
  description,
  bannerUrl, // fallback if no media
}) {
  const effectiveUrl = mediaUrl || bannerUrl;

  return (
    <View style={styles.card}>
      <Header avatarUri={avatarUri} primary={primary} secondary={secondary} />
      {isVideo ? (
        <VideoView
          player={player}
          style={styles.media}
          allowsPictureInPicture
          nativeControls={false}
          contentFit="cover"
        />
      ) : effectiveUrl ? (
        <Image source={{ uri: effectiveUrl }} style={styles.media} resizeMode="cover" />
      ) : (
        <View style={[styles.media, styles.placeholder]}>
          <Text style={styles.placeholderEmoji}>🔁</Text>
        </View>
      )}
      {!!description && (
        <Text numberOfLines={2} style={styles.reviewText}>
          {description}
        </Text>
      )}
    </View>
  );
}
