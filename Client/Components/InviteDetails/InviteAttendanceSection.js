import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import PersonRow from '../ActivityInvites/InviteeModal/PersonRow'; // adjust path

const ensureStatus = (rec, fallback) =>
  rec && rec.status ? rec : { ...rec, status: fallback };

export default function InviteAttendanceSection({
  attendance,
  currentUserId,
  onAcceptSelf,
  onDeclineSelf,
}) {
  if (!attendance) return null;

  const {
    goingCount,
    pendingCount,
    declinedCount,
    total,
    preview = [],
    goingPeople = [],
    pendingPeople = [],
    declinedPeople = [],
  } = attendance;

  const parts = [];
  if (goingCount > 0) parts.push(`${goingCount} going`);
  if (pendingCount > 0) parts.push(`${pendingCount} invited`);
  if (declinedCount > 0) parts.push(`${declinedCount} declined`);

  const attendanceSummary =
    parts.length > 0
      ? parts.join(' · ')
      : total > 0
      ? `${total} invited`
      : 'No attendees yet';

  return (
    <View style={styles.attendanceBlock}>
      <Text style={styles.sectionTitle}>Who’s invited</Text>
      {/* preview row stays simple */}
      <View style={styles.attendanceRow}>
        {preview.map((p) => {
          const initial = p?.name ? p.name[0] : '?';
          const source = p?.avatarUrl ? { uri: p.avatarUrl } : null;

          return (
            <View key={p.id} style={styles.attendeeAvatarWrapper}>
              {source ? (
                <Image source={source} style={styles.attendeeAvatar} />
              ) : (
                <View style={styles.attendeeFallback}>
                  <Text style={styles.attendeeFallbackText}>{initial}</Text>
                </View>
              )}
            </View>
          );
        })}

        {total > preview.length ? (
          <Text style={styles.moreInvitedText}>
            +{total - preview.length} more
          </Text>
        ) : null}
      </View>

      <Text style={styles.attendanceSummaryText}>{attendanceSummary}</Text>

      {/* Going list */}
      {goingPeople.length > 0 && (
        <View style={styles.subSection}>
          <Text style={styles.subSectionTitle}>Going</Text>
          {goingPeople.map((p) => (
            <PersonRow
              key={p.id}
              rec={ensureStatus(p, 'accepted')}
              currentUserId={currentUserId}
              onAcceptSelf={onAcceptSelf}
              onDeclineSelf={onDeclineSelf}
            />
          ))}
        </View>
      )}

      {/* Declined list */}
      {declinedPeople.length > 0 && (
        <View style={styles.subSection}>
          <Text style={styles.subSectionTitle}>Declined</Text>
          {declinedPeople.map((p) => (
            <PersonRow
              key={p.id}
              rec={ensureStatus(p, 'declined')}
              currentUserId={currentUserId}
              onAcceptSelf={onAcceptSelf}
              onDeclineSelf={onDeclineSelf}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  attendanceBlock: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  attendeeAvatarWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginRight: 4,
  },
  attendeeAvatar: {
    width: '100%',
    height: '100%',
  },
  attendeeFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attendeeFallbackText: {
    fontSize: 14,
    fontWeight: '700',
  },
  moreInvitedText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#555',
  },
  attendanceSummaryText: {
    fontSize: 13,
    color: '#555',
    marginBottom: 10,
  },
  subSection: {
    marginTop: 8,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  personAvatarWrapper: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  personAvatar: {
    width: '100%',
    height: '100%',
  },
  personName: {
    fontSize: 13,
    color: '#222',
  },
});
