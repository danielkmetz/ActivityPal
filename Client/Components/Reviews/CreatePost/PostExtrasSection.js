import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AntDesign, FontAwesome } from '@expo/vector-icons';

export default function PostExtrasRow({
  taggedUsers = [],      
  media = [],   
  onOpenTagModal,
  onOpenCamera,
  onOpenLibrary,
  containerStyle,
}) {
  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.row}>
        {/* Tag friends */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onOpenTagModal}
          activeOpacity={0.8}
        >
          <AntDesign name="tag" size={20} />
        </TouchableOpacity>
        {/* Camera */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onOpenCamera}
          activeOpacity={0.8}
        >
          <FontAwesome name="camera" size={20} />
        </TouchableOpacity>
        {/* Library */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onOpenLibrary}
          activeOpacity={0.8}
        >
          <FontAwesome name="picture-o" size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    marginRight: 8,
  },
});
