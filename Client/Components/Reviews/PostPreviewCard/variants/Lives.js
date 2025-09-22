import React from 'react';
import { View, Text, Image } from 'react-native';
import Header from '../parts/Header';
import styles from '../styles';

function LivePill() {
  return (
    <View style={styles.livePill}>
      <Text style={styles.livePillText}>LIVE</Text>
    </View>
  );
}

export default function Lives({ avatarUri, name, title, thumbUrl }) {
  return (
    <View style={styles.card}>
      <Header
        avatarUri={avatarUri}
        primary={name || 'Live Stream'}
        secondary={title || 'Live now'}
        rightSlot={<LivePill />}
      />
      {thumbUrl ? (
        <Image source={{ uri: thumbUrl }} style={styles.media} resizeMode="cover" />
      ) : (
        <View style={[styles.media, styles.placeholder]}>
          <Text style={styles.placeholderEmoji}>📺</Text>
        </View>
      )}
    </View>
  );
}
