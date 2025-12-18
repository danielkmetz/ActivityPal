import React, { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg';

export default function OtherUserHeader({
  onBack,
  bannerUrl,
  profilePicUrl,
  fullName,
  followersCount = 0,
  followingCount = 0,
  openFollowers,
  openFollowing,
}) {
  const bannerSource = useMemo(
    () => (bannerUrl ? { uri: bannerUrl } : null),
    [bannerUrl]
  );

  return (
    <>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={24} color="gray" />
      </TouchableOpacity>
      {!!bannerSource ? (
        <Image source={bannerSource} style={styles.coverPhoto} />
      ) : (
        <View style={[styles.coverPhoto, { backgroundColor: 'teal' }]} />
      )}

      <View style={styles.profileHeader}>
        <Image
          source={profilePicUrl ? { uri: profilePicUrl } : profilePicPlaceholder}
          style={styles.profilePicture}
        />
        <View style={styles.nameAndFollow}>
          <Text style={styles.userName}>{fullName}</Text>

          <View style={styles.connections}>
            <TouchableOpacity onPress={openFollowers}>
              <View style={[styles.followers, { marginRight: 15 }]}>
                <Text style={styles.followGroup}>Followers</Text>
                <Text style={[styles.followText, { fontSize: 18 }]}>{followersCount}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={openFollowing}>
              <View style={styles.followers}>
                <Text style={styles.followGroup}>Following</Text>
                <Text style={[styles.followText, { fontSize: 18 }]}>{followingCount}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 20,
    padding: 8,
  },
  coverPhoto: { width: "100%", height: 200 },
  profileHeader: {
    alignItems: "left",
    marginTop: -50,
    marginBottom: 20,
    marginLeft: 20,
    flexDirection: 'row',
  },
  nameAndFollow: { flexDirection: 'column', marginLeft: 15, marginTop: 50 },
  connections: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  followers: { flexDirection: 'column' },
  followGroup: { fontSize: 13 },
  followText: { alignSelf: 'flex-start', fontWeight: 'bold' },
  profilePicture: {
    width: 150, height: 150, borderRadius: 75, borderWidth: 3, borderColor: "#fff",
  },
  userName: { fontSize: 24, fontWeight: "bold", marginTop: 10 },
});
