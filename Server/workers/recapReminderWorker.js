const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const { InvitePost } = require('../models/Post');
const User = require('../models/User');
const Business = require('../models/Business');

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
// Global fallback if invite.details.timezone is missing
const DEFAULT_TZ = 'America/Chicago';

/**
 * Format the event time for human display in notifications,
 * using the invite's timezone if available.
 */
function fmtWhen(dateValue, tz) {
  if (!dateValue) return 'your plans';

  const iso =
    typeof dateValue === 'string'
      ? dateValue
      : dateValue.toISOString
      ? dateValue.toISOString()
      : String(dateValue);

  const zone = tz || DEFAULT_TZ;

  return dayjs.utc(iso).tz(zone).format('MMMM D [at] h:mm A');
}

/**
 * Core worker: find invites whose event started at least 2 hours ago,
 * and which haven't had recap reminders sent yet.
 *
 * - Uses details.dateTime as the evaluator (UTC)
 * - Uses details.timezone only for formatting the date string
 * - Writes one "activityInviteNeedsRecap" notification to:
 *   - the host (ownerId)
 *   - each accepted recipient (status === 'accepted')
 * - Sets details.recapReminderSentAt so this only fires once per invite
 */
async function runRecapReminderSweep() {
  const now = Date.now();
  const threshold = new Date(now - TWO_HOURS_MS);

  // 1) Find invites eligible for recap reminder
  const invites = await InvitePost.find({
    type: 'invite',
    'details.dateTime': { $lte: threshold },
    $or: [
      { 'details.recapReminderSentAt': { $exists: false } },
      { 'details.recapReminderSentAt': null },
    ],
  }).lean();

  if (!invites.length) return;

  for (const post of invites) {
    const details = post.details || {};
    const recipients = Array.isArray(details.recipients)
      ? details.recipients
      : [];

    // accepted recipients only
    const accepted = recipients.filter((r) => r && r.status === 'accepted');
    const acceptedIds = accepted
      .map((r) => r.userId)
      .filter(Boolean)
      .map((id) => String(id));

    const hostId = post.ownerId ? String(post.ownerId) : null;

    const userIdSet = new Set();
    if (hostId) userIdSet.add(hostId);
    for (const id of acceptedIds) userIdSet.add(id);

    const userIds = Array.from(userIdSet);
    const hasPeopleToNotify = userIds.length > 0;

    // Even if somehow there are no host/recipients, we should still mark this invite
    // as processed so we don't keep scanning it forever.
    if (!hasPeopleToNotify) {
      await InvitePost.updateOne(
        { _id: post._id },
        { $set: { 'details.recapReminderSentAt': new Date() } }
      );
      continue;
    }

    // Resolve business name (optional)
    let businessName = post.businessName || 'your plans';
    if (post.placeId) {
      const business = await Business.findOne({ placeId: post.placeId }).lean();
      if (business?.businessName) {
        businessName = business.businessName;
      }
    }

    const eventTz = details.timezone || DEFAULT_TZ;
    const whenLabel = fmtWhen(details.dateTime || post.dateTime, eventTz);

    // 2) Build notifications for host and attendees
    const nowDate = new Date();

    const bulkOps = userIds.map((uid) => {
      const isHost = hostId && uid === hostId;

      const message = isHost
        ? `How did your plans at ${businessName} on ${whenLabel} go? Post a recap for your invite.`
        : `How was ${businessName} on ${whenLabel}? Post a recap to share with your friends.`;

      return {
        updateOne: {
          filter: { _id: uid },
          update: {
            $push: {
              notifications: {
                type: 'activityInviteNeedsRecap',
                message,
                relatedId: post._id,   // link back to the invite
                typeRef: 'Post',
                targetId: post._id,
                targetRef: 'Post',
                postType: 'invite',
                createdAt: nowDate,
              },
            },
          },
        },
      };
    });

    if (bulkOps.length) {
      await User.bulkWrite(bulkOps);
    }

    // 3) Mark invite as processed so we don't send again
    await InvitePost.updateOne(
      { _id: post._id },
      { $set: { 'details.recapReminderSentAt': new Date() } }
    );
  }
}

module.exports = { runRecapReminderSweep };
