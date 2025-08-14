import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function AttendanceRow({
  isSender,
  isRecipient,
  hasRequested,
  onRequestJoin,
  totalGoing,
  onOpenInvitees,
}) {
  return (
    <View style={styles.row}>
      {!isRecipient && !isSender && (
        hasRequested ? (
          <View style={[styles.pill, styles.requested]}>
            <Text style={styles.requestedText}>✅ Requested</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={onRequestJoin} style={styles.pill}>
            <Text style={styles.cta}>✋ Ask to Join</Text>
          </TouchableOpacity>
        )
      )}
      <TouchableOpacity style={styles.pill} onPress={onOpenInvitees}>
        <Text style={styles.cta}>{totalGoing} going</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-start' },
  pill: { marginTop: 10, alignItems: 'center', backgroundColor: '#f0f0f0', padding: 8, borderRadius: 6, marginRight: 5 },
  requested: { backgroundColor: '#ddd' },
  requestedText: { fontSize: 14, color: '#888' },
  cta: { fontSize: 14, color: '#007bff' },
});
