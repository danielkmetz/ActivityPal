import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import profilePlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

export default function SelfProfileHeader({
  bannerUrl,
  profilePicUrl,
  fullName,
  followersCount = 0,
  followingCount = 0,
  onOpenFollowers,
  onOpenFollowing,
  onEditProfile,
  onSettings,
  onClearLog,
}) {
  return (
    <>
      {bannerUrl ? (
        <Image source={{ uri: bannerUrl }} style={styles.coverPhoto} />
      ) : (
        <View style={styles.bannerPlaceholder} />
      )}

      <View style={styles.profileHeader}>
        <Image
          source={profilePicUrl ? { uri: profilePicUrl } : profilePlaceholder}
          style={styles.profilePicture}
        />
        <View style={styles.nameAndFollow}>
          <Text style={styles.userName}>{fullName}</Text>

          <View style={styles.connections}>
            <TouchableOpacity onPress={onOpenFollowers}>
              <View style={[styles.followers, { marginRight: 15 }]}>
                <Text style={styles.followGroup}>Followers</Text>
                <Text style={[styles.followText, { fontSize: 18 }]}>{followersCount}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={onOpenFollowing}>
              <View style={styles.followers}>
                <Text style={styles.followGroup}>Following</Text>
                <Text style={[styles.followText, { fontSize: 18 }]}>{followingCount}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.editContainer}>
        <View style={styles.editButtons}>
          <TouchableOpacity style={styles.editProfileButton} onPress={onEditProfile}>
            <Ionicons name="pencil" size={20} color="white" />
            <Text style={styles.editProfileButtonText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.editProfileButton, { marginLeft: 10 }]} onPress={onSettings}>
            <Ionicons name="settings-sharp" size={24} color="white" />
            <Text style={styles.editProfileButtonText}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.editProfileButton, { marginLeft: 10 }]} onPress={onClearLog}>
            <Ionicons name="trash-bin" size={20} color="white" />
            <Text style={styles.editProfileButtonText}>Clear Log</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  coverPhoto: { width: "100%", height: 200 },
  bannerPlaceholder: { width: "100%", height: 200, backgroundColor: "teal" },
  profileHeader: { alignItems: "left", marginTop: -50, marginBottom: 10, marginLeft: 20, flexDirection: 'row' },
  nameAndFollow: { flexDirection: 'column', marginLeft: 15, marginTop: 50 },
  connections: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  followers: { flexDirection: 'column' },
  followGroup: { fontSize: 13 },
  followText: { alignSelf: 'flex-start', fontWeight: 'bold' },
  profilePicture: { width: 150, height: 150, borderRadius: 75, borderWidth: 3, borderColor: "#fff" },
  userName: { fontSize: 24, fontWeight: "bold", marginTop: 10 },
  editContainer: { flexDirection: "row", marginLeft: 20, justifyContent: "space-between" },
  editButtons: { flexDirection: "row", marginRight: 20, marginTop: 15 },
  editProfileButton: { backgroundColor: "gray", flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5 },
  editProfileButtonText: { color: "white", marginLeft: 5, fontWeight: "bold" },
});
