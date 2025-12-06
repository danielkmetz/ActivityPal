import { useMemo } from 'react';
import { getBucketKeyFromMs, labelForBucket } from '../utils/buckets';
import {
  getStartTimeMs,
  formatClockLabel,
  formatFullDateLabel,
  computeViewerStatus,
  computeAttendance,
  viewerStatusLabel,
  privacyLabel,
} from '../utils/InviteDetails/helpers';

export default function useInviteDetails(invite, currentUserId) {
  return useMemo(() => {
    if (!invite) {
      return {
        postContent: null,
        owner: null,
        fullName: '',
        isYou: false,
        bucketLabel: '',
        businessName: '',
        businessLogoUrl: null,
        clockLabel: '',
        fullDateLabel: '',
        note: '',
        viewerStatus: null,
        viewerStatusText: null,
        privacyText: null,
        attendance: {
          goingCount: 0,
          pendingCount: 0,
          declinedCount: 0,
          total: 0,
          preview: [],
          goingPeople: [],
          pendingPeople: [],
          declinedPeople: [],
        },
      };
    }

    const content = invite.original || invite;
    const ownerObj = content.owner || null;
    const ownerId =
      ownerObj?.id || ownerObj?._id || ownerObj?.userId || null;

    const isYouFlag =
      ownerId && currentUserId && String(ownerId) === String(currentUserId);

    const firstName = ownerObj?.firstName || '';
    const lastName = ownerObj?.lastName || '';
    const fn = [firstName, lastName].filter(Boolean).join(' ') || 'Someone';

    const startMs = getStartTimeMs(content);
    const bucketKey = getBucketKeyFromMs(startMs);
    const bucketLabelVal = labelForBucket(bucketKey);

    const bName =
      content.businessName ||
      content.business?.businessName ||
      'Unnamed Location';

    const logoUrl =
      content.businessLogoUrl ||
      content.business?.logoUrl ||
      null;

    const clock = formatClockLabel(content);
    const fullDate = formatFullDateLabel(content);
    const noteText = (content.message || '').trim();

    const vStatus = computeViewerStatus(content, currentUserId);
    const vStatusText = viewerStatusLabel(vStatus);
    const privText = privacyLabel(content) || privacyLabel(invite);
    const attendanceInfo = computeAttendance(content);

    return {
      postContent: content,
      owner: ownerObj,
      fullName: fn,
      isYou: isYouFlag,
      bucketLabel: bucketLabelVal,
      businessName: bName,
      businessLogoUrl: logoUrl,
      clockLabel: clock,
      fullDateLabel: fullDate,
      note: noteText,
      viewerStatus: vStatus,
      viewerStatusText: vStatusText,
      privacyText: privText,
      attendance: attendanceInfo,
    };
  }, [invite, currentUserId]);
}
