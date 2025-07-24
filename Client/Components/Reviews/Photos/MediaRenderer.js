import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import VideoThumbnail from '../VideoThumbnail';
import { isVideo } from '../../../utils/isVideo';

const MediaRenderer = ({ media, width = 300, height = 300 }) => {
  if (!media || media.length === 0) return null;

  return (
    <View style={styles.mediaContainer}>
      {media.map((file, idx) =>
        isVideo(file) ? (
          <VideoThumbnail
            key={idx}
            file={file}
            width={width}
            height={height}
            shouldPlay={false}
          />
        ) : (
          <Image
            key={idx}
            source={{ uri: file.uri || file.mediaUrl }}
            style={[styles.image, { width, height }]}
            resizeMode="cover"
          />
        )
      )}
    </View>
  );
};

export default MediaRenderer;

const styles = StyleSheet.create({
  mediaContainer: {
    gap: 10,
    marginVertical: 8,
  },
  image: {
    borderRadius: 8,
  },
});
