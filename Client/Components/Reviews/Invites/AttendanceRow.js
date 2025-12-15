import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import NeedsRecapBadge from './NeedsRecapBadge';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import { toId } from '../../../utils/Formatting/toId';

const AttendanceRow = ({
  post,
  hasRequested,
  onRequestJoin,
  onOpenInvitees,
  needsRecap = false,
  isPastTwoHours = false,
}) => {
  const postContent = post?.original ?? post ?? {};
  const details = postContent?.details || {};
  const recipients = Array.isArray(details.recipients) ? details.recipients : [];
  const postOwner = postContent?.owner;
  const user = useSelector(selectUser);
  const meId = toId(user?.id ?? user?._id);
  const ownerId = toId(postOwner?.id ?? postOwner?._id);
  const isOwner = !!meId && ownerId === meId;

  const myRecipientRow = useMemo(() => {
    if (!meId) return null;
    return recipients.find((r) => {
      const recUserId = r?.userId ?? r?.user?.id ?? r?.user?._id ?? r?.id;
      return toId(recUserId) === meId;
    }) || null;
  }, [recipients, meId]);

  const isRecipient = !!myRecipientRow;

  const { acceptedCount, totalCount } = useMemo(() => {
    const total = recipients.length;
    const accepted = recipients.filter((r) => r.status === 'accepted').length;
    return { acceptedCount: accepted, totalCount: total };
  }, [recipients]);

  return (
    <View style={styles.container}>
      {/* Left side: button-style attendance pill */}
      <TouchableOpacity
        onPress={onOpenInvitees}
        activeOpacity={0.8}
        style={styles.attendanceButton}
      >
        <Text style={styles.attendancePrimary}>
          Attendees {acceptedCount}/{totalCount}
        </Text>
      </TouchableOpacity>
      {/* Right side: recap badge OR request button, never both */}
      <View style={styles.rightSlot}>
        {needsRecap ? (
          <NeedsRecapBadge post={post} />
        ) : !isPastTwoHours && !isOwner && !isRecipient ? (
          hasRequested ? (
            <View style={styles.requestedPill}>
              <Text style={styles.requestedText}>Requested</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={onRequestJoin}
              style={styles.requestButton}
              activeOpacity={0.8}
            >
              <Text style={styles.requestButtonText}>Request to join</Text>
            </TouchableOpacity>
          )
        ) : null}
      </View>
    </View>
  );
};

export default AttendanceRow;

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // LEFT SIDE
  attendanceButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f2f2f2',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  attendancePrimary: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  // RIGHT SIDE
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#007AFF',
  },
  requestButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  requestedPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eee',
  },
  requestedText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
});
