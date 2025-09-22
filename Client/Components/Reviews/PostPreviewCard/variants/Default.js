import React from 'react';
import { View, Text, Image } from 'react-native';
import Media from '../parts/Media';
import styles from '../styles';

const pinPic = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

export default function Default({
  avatarSource,
  displayName,
  type,
  ratingStars,
  isVideo,
  player,
  imageUrl,      // firstMediaUrl
  bannerUrl,     // fallback if no media
  description,
}) {
  const effectiveUrl = imageUrl || bannerUrl;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {avatarSource}
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
        {type === 'check-in' && <Image source={{ uri: pinPic }} style={styles.pinPic} />}
      </View>

      {type === 'review' && !!ratingStars && (
        <View style={styles.ratingRow}>
          {ratingStars}
        </View>
      )}

      <Media
        isVideo={isVideo}
        player={player}
        imageUrl={effectiveUrl}
        placeholder="🖼️"
      />

      {!!description && (
        <Text numberOfLines={2} style={styles.reviewText}>
          {description}
        </Text>
      )}
    </View>
  );
}
