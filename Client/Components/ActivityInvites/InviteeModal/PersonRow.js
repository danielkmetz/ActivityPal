import React, { memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg';
import { toId } from '../../../utils/Formatting/toId';

const getRecId = (r) => toId(r?.userId ?? r?.user?.id ?? r?.user?._id ?? r?.id);

function PersonRow({
  rec,
  currentUserId,
  isHost = false,
  onAcceptSelf = () => {},
  onDeclineSelf = () => {},
  onNudge = () => {},
}) {
  const meId = toId(currentUserId);
  const recId = getRecId(rec);
  const isMe = recId === meId;
  const pic = rec?.user?.profilePicUrl || rec?.profilePicUrl || rec?.avatarUrl || null;
  const first = rec?.user?.firstName || rec?.firstName || '';
  const last  = rec?.user?.lastName  || rec?.lastName  || '';
  const fallbackName = rec?.name || '';
  const fullName =
    [first, last].filter(Boolean).join(' ') ||
    fallbackName ||
    'Someone';

  const status = rec?.status; // 'accepted' | 'declined' | 'pending' etc.
  const hasBeenNudged = !!rec?.nudgedAt;

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

  const handleNudge = () => {
    if (!recId) return;

    if (hasBeenNudged) {
      Alert.alert(
        'Already nudged',
        'You’ve already nudged this person about this plan.'
      );
      return;
    }

    onNudge(recId);
  };

  const canNudge = isHost && !isMe && status === 'pending';

  return (
    <View style={styles.row}>
      <View style={styles.infoContainer}>
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
      {canNudge && (
        <TouchableOpacity
          style={[
            styles.nudgeButton,
            !hasBeenNudged && styles.nudgeButtonActive, // filled when NOT nudged
          ]}
          onPress={handleNudge} // <- always active, logic decides what happens
        >
          <Text
            style={[
              styles.nudgeText,
              !hasBeenNudged && styles.nudgeTextActive, // white text when NOT nudged
            ]}
          >
            {hasBeenNudged ? 'Nudged' : 'Nudge'}
          </Text>
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
    justifyContent: 'space-between',
    marginTop: 5,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
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
  nudgeButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#009999',
    marginLeft: 10,
    backgroundColor: 'transparent',
  },
  nudgeText: {
    fontSize: 13,
    color: '#009999',
    fontWeight: '600',
  },
  nudgeButtonActive: {
    backgroundColor: '#009999',
  },
  nudgeTextActive: {
    color: '#ffffff',
  },
});
