import React from 'react';
import { View, Text, Image } from 'react-native';
import Header from '../parts/Header';
import styles from '../styles';

export default function Invites({ avatarUri, primary, secondary, dateChip, mediaUri, bottomText }) {
  return (
    <View style={styles.card}>
      <Header avatarUri={avatarUri} primary={primary} secondary={secondary} />
      {!!dateChip && (
        <View style={styles.dateChip}>
          <Text style={styles.dateChipText}>{dateChip}</Text>
        </View>
      )}
      {mediaUri ? (
        <Image source={{ uri: mediaUri }} style={styles.media} resizeMode="cover" />
      ) : (
        <View style={[styles.media, styles.placeholder]}>
          <Text style={styles.placeholderEmoji}>🎟️</Text>
        </View>
      )}
      {!!bottomText && (
        <Text numberOfLines={2} style={styles.reviewText}>
          {bottomText}
        </Text>
      )}
    </View>
  );
}
