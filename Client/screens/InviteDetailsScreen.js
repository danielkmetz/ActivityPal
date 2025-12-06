import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { selectPostById } from '../Slices/PostsSelectors/postsSelectors';
import { selectUser } from '../Slices/UserSlice';
import useInviteDetails from '../hooks/inviteDetails';
import InviteHero from '../Components/InviteDetails/InviteHero';
import InviteAttendanceSection from '../Components/InviteDetails/InviteAttendanceSection';
import InvitePlaceBlock from '../Components/InviteDetails/InvitePlaceBlock';
import InviteRSVPControls from '../Components/InviteDetails/InviteRSVPControls';
import useInviteActions from '../utils/UserInviteActions/userInviteActions'; // centralized helper

const toId = (v) => (v && v.toString ? v.toString() : v || '');

export default function InviteDetailsScreen() {
  const route = useRoute();
  const postId = route.params?.postId || null;
  const [requested, setRequested] = useState(false);

  const currentUser = useSelector(selectUser);
  const invite = useSelector((state) =>
    postId ? selectPostById(state, postId) : null
  );

  // Centralized invite actions (includes conflict checks for accept)
  const { acceptForMe, declineForMe, requestToJoin } = useInviteActions(invite);

  const currentUserId =
    currentUser?.id || currentUser?._id || currentUser?.userId || null;

  const {
    postContent,
    owner,
    fullName,
    isYou,
    bucketLabel,
    businessName,
    businessLogoUrl,
    clockLabel,
    fullDateLabel,
    note,
    viewerStatus,
    viewerStatusText,
    privacyText,
    attendance,
  } = useInviteDetails(invite, currentUserId);

  if (!invite || !postContent) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          This invite is no longer available.
        </Text>
      </View>
    );
  }

  const avatarUri = owner?.profilePicUrl || owner?.avatarUrl || null;

  const details = postContent?.details || {};
  const requestsArr = Array.isArray(details.requests) ? details.requests : [];

  const hasRequestedFromServer =
    currentUserId &&
    requestsArr.some(
      (r) => String(toId(r.userId || r.user)) === String(currentUserId)
    );

  const hasRequested = requested || hasRequestedFromServer;

  const canRequestJoin =
    !isYou &&
    !viewerStatus && // not hosting, not invited, not going/declined
    !!currentUserId;

  const handleRequestJoin = async () => {
    if (!postContent || !currentUserId) return;
    const ok = await requestToJoin();
    if (ok) {
      setRequested(true);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      bounces={false}
    >
      {/* "Tonight" / "Tomorrow" / "This weekend" */}
      <View style={styles.bucketRow}>
        <Text style={styles.bucketLabel}>{bucketLabel}</Text>
      </View>

      {/* Big event title / note */}
      {note ? <Text style={styles.eventTitle}>{note}</Text> : null}

      {/* Host / user hero */}
      <InviteHero
        avatarUri={avatarUri}
        fullName={fullName}
        isYou={isYou}
        viewerStatusText={viewerStatusText}
        privacyText={privacyText}
      />

      {/* Place & time block */}
      <InvitePlaceBlock
        businessName={businessName}
        businessLogoUrl={businessLogoUrl}
        fullDateLabel={fullDateLabel}
        clockLabel={clockLabel}
      />

      {/* Attendance / who’s invited */}
      <InviteAttendanceSection
        attendance={attendance}
        currentUserId={currentUserId}
        onAcceptSelf={acceptForMe}
        onDeclineSelf={declineForMe}
      />

      {/* RSVP controls for current user (only for invited / pending) */}
      <InviteRSVPControls
        viewerStatus={viewerStatus}
        isYou={isYou}
        onAccept={acceptForMe}
        onDecline={declineForMe}
      />

      {/* Request to join CTA */}
      {canRequestJoin && (
        <TouchableOpacity
          style={[
            styles.requestButton,
            hasRequested && styles.requestButtonDisabled,
          ]}
          onPress={handleRequestJoin}
          disabled={hasRequested}
          activeOpacity={0.8}
        >
          <Text style={styles.requestButtonText}>
            {hasRequested ? 'Request sent' : 'Request to join'}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: 120,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  bucketRow: {
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bucketLabel: {
    fontSize: 16,
    color: '#777',
    fontWeight: '500',
  },
  eventTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  requestButton: {
    marginTop: 24,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#111',
  },
  requestButtonDisabled: {
    backgroundColor: '#999',
  },
  requestButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#777',
  },
});
