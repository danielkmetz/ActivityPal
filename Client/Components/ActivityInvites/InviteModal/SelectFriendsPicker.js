import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from 'react-native';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg';

export default function SelectFriendsPicker({
  selectedFriends = [],
  displayFriends = [],
  onOpenModal,                 // () => void  (open TagFriendsModal)
  setSelectedFriends,          // (updater) => void
  containerStyle,
  buttonStyle,
  buttonTextStyle,
}) {
  const hasSelected = Array.isArray(selectedFriends) && selectedFriends.length > 0;

  const getUserId = (user) =>
    user?._id ||
    user?.id ||
    user?.userId ||
    user?.user?._id ||
    user?.user?.id;

  const handleRemove = (id) => {
    if (!id) return;
    setSelectedFriends((prev = []) => prev.filter((fid) => fid !== id));
  };

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <TouchableOpacity
        style={[styles.selectFriendsButton, buttonStyle]}
        onPress={onOpenModal}
      >
        <Text style={[styles.selectFriendsText, buttonTextStyle]}>
          {hasSelected
            ? `👥 ${selectedFriends.length} Friend${selectedFriends.length > 1 ? 's' : ''} Selected`
            : '➕ Select Friends'}
        </Text>
      </TouchableOpacity>
      {hasSelected && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectedFriendsPreview}
        >
          {displayFriends.map((friend) => {
            const id = getUserId(friend);
            if (!id || !selectedFriends.includes(id)) return null;

            const uri =
              friend.profilePicUrl || friend.presignedProfileUrl
                ? { uri: friend.profilePicUrl || friend.presignedProfileUrl }
                : profilePicPlaceholder;

            return (
              <View key={id} style={styles.friendPreview}>
                <Pressable
                  onPress={() => handleRemove(id)}
                  hitSlop={8}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>

                <Image source={uri} style={styles.profilePic} />
                <Text style={styles.friendName}>
                  {friend.firstName || friend.username || 'Friend'}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  selectFriendsButton: {
    backgroundColor: '#33cccc',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectFriendsText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  selectedFriendsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 2,
    paddingTop: 8,    // adds spacing only when preview is present
  },
  friendPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0ff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  removeBtn: {
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 16,
    color: '#000', // black “x”
    lineHeight: 16,
  },
  profilePic: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
  },
  friendName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
});
