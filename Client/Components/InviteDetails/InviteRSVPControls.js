import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function InviteRSVPControls({
  viewerStatus,
  isYou,
  onAccept,
  onDecline,
}) {
  if (!viewerStatus || isYou) return null;

  const isPending =
    viewerStatus === 'invited' || viewerStatus === 'pending';

  if (!isPending) return null;

  return (
    <View style={styles.rsvpBlock}>
      <Text style={styles.rsvpLabel}>Respond to invite</Text>
      <View style={styles.rsvpButtonsRow}>
        <TouchableOpacity
          style={[
            styles.rsvpButton,
            styles.rsvpButtonLeft,
            styles.rsvpNeutral,  
          ]}
          onPress={onAccept}
          activeOpacity={0.8}
        >
          <Text style={styles.rsvpNeutralText}>Going</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rsvpButton, styles.rsvpNeutral]}
          onPress={onDecline}
          activeOpacity={0.8}
        >
          <Text style={styles.rsvpNeutralText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rsvpBlock: {
    marginTop: 24,
  },
  rsvpLabel: {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
  },
  rsvpButtonsRow: {
    flexDirection: 'row',
  },
  rsvpButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rsvpButtonLeft: {
    marginRight: 8,
  },
  rsvpPrimary: {
    backgroundColor: '#111',
  },
  rsvpPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rsvpSecondary: {
    backgroundColor: '#F3F4F6',
  },
  rsvpSecondaryText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '600',
  },
  rsvpNeutral: {
    backgroundColor: '#F3F4F6',
  },
  rsvpNeutralText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '600',
  },

});
