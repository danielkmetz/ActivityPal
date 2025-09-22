import React from 'react';
import { View, Text } from 'react-native';
import { Avatar } from 'react-native-paper';
import profilePicPlaceholder from '../../../../assets/pics/profile-pic-placeholder.jpg';
import styles from '../styles';

export default function Header({ avatarUri, primary, secondary, rightSlot = null, rounded = true }) {
  const source =
    typeof avatarUri === 'string'
      ? { uri: avatarUri }
      : avatarUri || profilePicPlaceholder;

  return (
    <View style={styles.header}>
      <Avatar.Image rounded={rounded} size={40} source={source} />
      <View style={{ marginLeft: 8, flex: 1 }}>
        {!!primary && <Text style={styles.name} numberOfLines={1}>{primary}</Text>}
        {!!secondary && <Text style={styles.subtle} numberOfLines={1}>{secondary}</Text>}
      </View>
      {rightSlot}
    </View>
  );
}
