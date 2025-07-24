import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import VideoThumbnail from '../VideoThumbnail';
import { isVideo } from '../../../utils/isVideo';

const MediaPreview = ({ mediaFiles, width = 100, height = 100 }) => {
  if (!mediaFiles || mediaFiles.length === 0) return null;

  return (
    <View style={styles.previewContainer}>
      {mediaFiles.map((file, index) =>
        isVideo(file) ? (
          <VideoThumbnail key={index} file={file} width={width} height={height} />
        ) : (
          <Image key={index} source={{ uri: file.uri }} style={[styles.image, { width, height }]} />
        )
      )}
    </View>
  );
};

export default MediaPreview;

const styles = StyleSheet.create({
  previewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  image: {
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
});
