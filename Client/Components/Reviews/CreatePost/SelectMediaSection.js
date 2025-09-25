import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import SectionHeader from '../SectionHeader';
import VideoThumbnail from '../VideoThumbnail';
import { isVideo } from '../../../utils/isVideo';

export default function SelectedMediaSection({
  selectedPhotos = [],
  onOpenCamera,          
  onOpenLibrary,         
  onOpenPhotoDetails,    
  containerStyle,
}) {
  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.headerRow}>
        <SectionHeader title="Selected Media" />
        <View style={{flexDirection: 'row'}}>
          <TouchableOpacity style={[styles.tagBtn, { marginRight: 5 }]} onPress={onOpenCamera}>
            <FontAwesome name="camera" size={18} />
            <Text style={styles.tagBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tagBtn} onPress={onOpenLibrary}>
            <FontAwesome name="picture-o" size={18} />
            <Text style={styles.tagBtnText}>Library</Text>
          </TouchableOpacity>
        </View>
      </View>
      {selectedPhotos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row' }}>
            {selectedPhotos.map((item, i) => (
              <TouchableOpacity key={i.toString()} onPress={() => onOpenPhotoDetails?.(item)}>
                {isVideo(item) ? (
                  <VideoThumbnail file={item} width={80} height={80} />
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
      ) : (
        <Text style={styles.subText}>No media selected yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  subText: { color: '#888', marginBottom: 10 },
  media: { width: 80, height: 80, marginRight: 10, borderRadius: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f2f2f2',
  },
  tagBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
