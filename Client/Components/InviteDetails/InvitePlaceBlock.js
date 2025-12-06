import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

const pinPic = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

export default function InvitePlaceBlock({
  businessName,
  businessLogoUrl,
  fullDateLabel,
  clockLabel,
}) {
  const iconSource = businessLogoUrl
    ? { uri: businessLogoUrl }
    : { uri: pinPic };

  return (
    <View style={styles.placeBlock}>
      <View style={styles.placeRow}>
        <View style={styles.placeIconWrapper}>
          <Image source={iconSource} style={styles.placeIcon} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.placeName} numberOfLines={2}>
            {businessName}
          </Text>
          {!!fullDateLabel && (
            <Text style={styles.fullDateText}>{fullDateLabel}</Text>
          )}
          {!!clockLabel && !fullDateLabel && (
            <Text style={styles.fullDateText}>{clockLabel}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeBlock: {
    marginTop: 8,
    marginBottom: 24,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: '#f2f2f2',
  },
  placeIcon: {
    width: '100%',
    height: '100%',
  },
  placeName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  fullDateText: {
    fontSize: 14,
    color: '#555',
    marginTop: 4,
  },
});
