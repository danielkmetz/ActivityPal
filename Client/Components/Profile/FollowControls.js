import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function FollowControls({
  isFollowing,
  isRequestSent,
  isRequestReceived,
  onUnfollow,
  onAcceptRequest,
  onDenyRequest,
  onCancelRequest,
  onFollow,
  onMessage,
}) {
  const [dropdownVisible, setDropdownVisible] = useState(false);

  if (isFollowing) {
    return (
      <View style={styles.buttonRow}>
        <View style={styles.followBtnWrapper}>
          <TouchableOpacity
            style={styles.friendsButton}
            onPress={() => setDropdownVisible(v => !v)}
            activeOpacity={0.8}
          >
            <Text style={styles.friendsText}>Following</Text>
          </TouchableOpacity>

          {dropdownVisible && (
            <View style={styles.dropdown}>
              <TouchableOpacity style={styles.dropdownItem} onPress={onUnfollow}>
                <Text style={styles.dropdownText}>Unfollow</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.messageButton} onPress={onMessage}>
          <Text style={styles.friendsText}>Message</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isRequestReceived) {
    return (
      <View style={styles.requestButtonsContainer}>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: 'green', marginRight: 10 }]} onPress={onAcceptRequest}>
          <Text style={styles.btnText}>Accept Request</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: 'red', marginLeft: 10 }]} onPress={onDenyRequest}>
          <Text style={styles.btnText}>Deny Request</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isRequestSent) {
    return (
      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: 'gray', marginHorizontal: 20 }]} onPress={onCancelRequest}>
        <Text style={styles.btnText}>Cancel Request</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#009999', marginHorizontal: 20 }]} onPress={onFollow}>
      <Text style={styles.btnText}>Follow</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buttonRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', overflow: 'visible' },
  followBtnWrapper: { position: 'relative', width: '40%', alignItems: 'center' },
  friendsButton: {
    backgroundColor: 'gray', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25,
    alignItems: 'center', marginTop: 20, width: '100%', marginLeft: 25,
  },
  friendsText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dropdown: {
    position: 'absolute', top: 60, left: 25, right: 0, backgroundColor: '#fff', borderRadius: 8, paddingVertical: 6,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 10, zIndex: 999,
  },
  dropdownItem: { paddingVertical: 10, alignItems: 'center' },
  dropdownText: { color: 'red', fontSize: 16, fontWeight: 'bold' },
  messageButton: { backgroundColor: 'gray', marginHorizontal: 20, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25, alignItems: 'center', marginTop: 20, width: '40%' },
  requestButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 20, marginTop: 20 },
  primaryBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25, alignItems: 'center', marginTop: 20, flex: 1 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
