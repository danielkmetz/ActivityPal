import React from 'react';
import { View, Text } from 'react-native';
import Header from '../parts/Header';
import VideoThumbnail from '../../VideoThumbnail';
import styles from '../styles';

export default function Replays({ avatarUri, name, title, file }) {
  return (
    <View style={styles.card}>
      <Header avatarUri={avatarUri} primary={name || 'Live Replay'} />
      <View style={{ alignSelf: 'center' }}>
        <VideoThumbnail file={file} width={200} height={200} />
      </View>
      {!!title && (
        <Text numberOfLines={2} style={styles.reviewText}>
          {title}
        </Text>
      )}
    </View>
  );
}
