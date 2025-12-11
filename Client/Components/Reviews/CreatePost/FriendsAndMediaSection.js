import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { AntDesign, FontAwesome } from '@expo/vector-icons';
import SectionHeader from '../SectionHeader';
import FriendPills from '../FriendPills';
import VideoThumbnail from '../VideoThumbnail';
import { isVideo } from '../../../utils/isVideo';

export default function FriendsAndMediaSection({
  taggedUsers = [],
  selectedPhotos = [],
  onOpenTagModal,
  onOpenCamera,
  onOpenLibrary,
  onOpenPhotoDetails,
  containerStyle,
}) {
  const hasTags =
    Array.isArray(taggedUsers) && taggedUsers.length > 0;
  const hasMedia =
    Array.isArray(selectedPhotos) && selectedPhotos.length > 0;

  return (
    <View style={[styles.container, containerStyle]}>
      <SectionHeader title="Friends & media" />

      {/* Friends row */}
      <View style={styles.rowHeader}>
        <View style={styles.rowTitle}>
          <AntDesign name="team" size={18} style={styles.rowIcon} />
          <Text style={styles.rowLabel}>Friends in this post</Text>
        </View>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onOpenTagModal}
          activeOpacity={0.8}
        >
          <AntDesign name="tag" size={16} />
          <Text style={styles.actionText}>Add</Text>
        </TouchableOpacity>
      </View>

      {hasTags ? (
        <FriendPills friends={taggedUsers} />
      ) : (
        <Text style={styles.subText}>
          Add people you were with
        </Text>
      )}

      <View style={styles.divider} />

      {/* Media row */}
      <View style={styles.rowHeader}>
        <View style={styles.rowTitle}>
          <FontAwesome
            name="picture-o"
            size={18}
            style={styles.rowIcon}
          />
          <Text style={styles.rowLabel}>Photos & videos</Text>
        </View>
        <View style={styles.mediaActions}>
          <TouchableOpacity
            style={[styles.actionBtn, { marginRight: 6 }]}
            onPress={onOpenCamera}
            activeOpacity={0.8}
          >
            <FontAwesome name="camera" size={16} />
            <Text style={styles.actionText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onOpenLibrary}
            activeOpacity={0.8}
          >
            <FontAwesome name="picture-o" size={16} />
            <Text style={styles.actionText}>Library</Text>
          </TouchableOpacity>
        </View>
      </View>

      {hasMedia ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <View style={styles.mediaRow}>
            {selectedPhotos.map((item, i) => (
              <TouchableOpacity
                key={i.toString()}
                onPress={() => onOpenPhotoDetails?.(item)}
                activeOpacity={0.8}
              >
                {isVideo(item) ? (
                  <VideoThumbnail
                    file={item}
                    width={80}
                    height={80}
                  />
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
        <Text style={styles.subText}>
          Add a photo or short clip
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    marginRight: 6,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#f2f2f2',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  subText: {
    color: '#888',
    fontSize: 13,
    marginBottom: 10,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5e5',
    marginVertical: 10,
  },
  mediaRow: {
    flexDirection: 'row',
  },
  media: {
    width: 80,
    height: 80,
    marginRight: 10,
    borderRadius: 8,
  },
  mediaActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
