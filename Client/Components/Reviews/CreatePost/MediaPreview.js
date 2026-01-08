import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import VideoThumbnail from '../VideoThumbnail';
import { isVideo } from '../../../utils/isVideo';

export default function MediaPreview({
  media = [],
  onOpenPhotoDetails,
  onOpenEditPhotos,   // 👈 new prop
  containerStyle,
}) {
  const hasMedia = Array.isArray(media) && media.length > 0;
  if (!hasMedia) return null;

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          <FontAwesome name="picture-o" size={14} style={styles.icon} />
          <Text style={styles.label}>Attached media</Text>
        </View>
        {onOpenEditPhotos && (
          <TouchableOpacity
            onPress={onOpenEditPhotos}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.mediaRow}>
          {selectedPhotos.map((item, i) => (
            <TouchableOpacity
              key={i.toString()}
              onPress={() => onOpenPhotoDetails?.(item)}
              activeOpacity={0.8}
            >
              {isVideo(item) ? (
                <VideoThumbnail file={item} width={72} height={72} />
              ) : (
                <Image
                  source={{ uri: item.uri || item.url }}
                  style={styles.media}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
  },
  editText: {
    fontSize: 11,
    color: '#6b7280',
  },
  mediaRow: {
    flexDirection: 'row',
  },
  media: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 8,
  },
});
