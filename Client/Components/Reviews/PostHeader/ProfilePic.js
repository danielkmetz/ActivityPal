import React from 'react';
import { Image, TouchableOpacity, StyleSheet, View } from 'react-native';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg'; 

export default function ProfilePic({
  userId,
  profilePicUrl,
  size = 40,
  onPress,          // optional: tap to open profile, etc.
  containerStyle,
  imageStyle,
  ...rest           // keep compat with any old props
}) {
  const source = profilePicUrl
    ? { uri: profilePicUrl }
    : profilePicPlaceholder;

  const avatar = (
    <Image
      source={source}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        imageStyle,
      ]}
      {...rest}
    />
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={() => onPress(userId)}
        activeOpacity={0.7}
        style={[styles.container, containerStyle]}
      >
        {avatar}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.container, containerStyle]}>{avatar}</View>;
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    resizeMode: 'cover',
    backgroundColor: '#ddd',
  },
});
