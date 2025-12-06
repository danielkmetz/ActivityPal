import React, { memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg';

const toId = (v) => (v && v.toString ? v.toString() : v || '');
const getRecId = (r) => toId(r?.userId ?? r?.user?.id ?? r?.user?._id ?? r?.id);

function PersonRow({
  rec,
  currentUserId,
  onAcceptSelf = () => {},
  onDeclineSelf = () => {},
}) {
  const meId = toId(currentUserId);
  const isMe = getRecId(rec) === meId;

  const pic =
    rec?.user?.profilePicUrl ||
    rec?.profilePicUrl ||
    rec?.avatarUrl || // 👈 allow attendance shape
    null;

  const first = rec?.user?.firstName || rec?.firstName || '';
  const last  = rec?.user?.lastName  || rec?.lastName  || '';
  const fallbackName = rec?.name || ''; // 👈 attendance shape
  const fullName =
    [first, last].filter(Boolean).join(' ') ||
    fallbackName ||
    'Someone';

  const status = rec?.status; // 'accepted' | 'declined' etc.

  const promptEditResponse = () => {
    if (status === 'accepted') {
      Alert.alert(
        'Edit response',
        'Change your response?',
        [
          { text: 'Decline', style: 'destructive', onPress: onDeclineSelf },
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true }
      );
    } else if (status === 'declined') {
      Alert.alert(
        'Edit response',
        'Change your response?',
        [
          { text: 'Accept', onPress: onAcceptSelf },
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true }
      );
    }
  };

  return (
    <View style={styles.row}>
      <Image
        source={pic ? { uri: pic } : profilePicPlaceholder}
        style={styles.profilePic}
      />
      <Text style={styles.name}>{fullName}</Text>
      {isMe && (status === 'accepted' || status === 'declined') && (
        <TouchableOpacity onPress={promptEditResponse}>
          <Text style={styles.editLink}> Edit response</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default memo(PersonRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  profilePic: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
  },
  name: {
    fontSize: 16,
    color: '#555',
    paddingLeft: 4,
  },
  editLink: {
    marginLeft: 8,
    textDecorationLine: 'underline',
    color: '#007bff',
    fontSize: 14,
  },
});
