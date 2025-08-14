import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { FontAwesome, AntDesign } from '@expo/vector-icons';
import SectionHeader from '../SectionHeader';
import VideoThumbnail from '../VideoThumbnail';
import { isVideo } from '../../../utils/isVideo';

export default function SelectedMediaSection({
  selectedPhotos = [],
  onOpenCamera,          
  onOpenLibrary,         
  onOpenTagModal,        
  onOpenPhotoDetails,    
  containerStyle,
}) {
  return (
    <View style={[styles.container, containerStyle]}>
      <SectionHeader title="Selected Media" />
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
      <View style={[styles.iconActionRow, !selectedPhotos.length && { marginTop: 20 }]}>
        <TouchableOpacity style={styles.iconAction} onPress={onOpenCamera}>
          <FontAwesome name="camera" size={24} />
          <Text style={styles.iconLabel}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconAction} onPress={onOpenLibrary}>
          <FontAwesome name="picture-o" size={24} />
          <Text style={styles.iconLabel}>Library</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconAction} onPress={onOpenTagModal}>
          <AntDesign name="tag" size={24} />
          <Text style={styles.iconLabel}>Tag</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  subText: { color: '#888', marginBottom: 10 },
  media: { width: 80, height: 80, marginRight: 10, borderRadius: 8 },
  iconActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  iconAction: {
    alignItems: 'center',
    width: 80,
    gap: 6,
  },
  iconLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    marginTop: 4,
  },
});
