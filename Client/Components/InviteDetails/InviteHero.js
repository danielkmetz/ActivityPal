import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg'; // <-- adjust path

const AVATAR_SIZE = 112;

export default function InviteHero({
  avatarUri,
  fullName,
  isYou,
  viewerStatusText,
  privacyText,
}) {
  const avatarSource = avatarUri
    ? { uri: avatarUri }
    : profilePicPlaceholder;

  return (
    <View style={styles.hero}>
      <View style={styles.avatarWrapper}>
        <Image source={avatarSource} style={styles.avatar} />
      </View>

      <View style={styles.nameRow}>
        <Text style={styles.nameText} numberOfLines={1}>
          {fullName}
        </Text>
      </View>

      <View style={styles.heroSublineRow}>
        <Text style={styles.heroSublineText}>
          {isYou ? 'You are hosting this' : 'Hosting this plan'}
        </Text>
      </View>

      <View style={styles.heroPillsRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{isYou ? 'YOU' : 'HOST'}</Text>
        </View>

        {viewerStatusText && !isYou ? (
          <View style={[styles.pill, styles.secondaryPill]}>
            <Text style={styles.secondaryPillText}>{viewerStatusText}</Text>
          </View>
        ) : null}

        {privacyText ? (
          <View style={[styles.pill, styles.secondaryPill]}>
            <Text style={styles.secondaryPillText}>{privacyText}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#f2f2f2',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameText: {
    fontSize: 20,
    fontWeight: '700',
  },
  heroSublineRow: {
    marginBottom: 8,
  },
  heroSublineText: {
    fontSize: 13,
    color: '#666',
  },
  heroPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#000',
    marginRight: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  secondaryPill: {
    backgroundColor: '#F3F4F6',
  },
  secondaryPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
  },
});
