// runConflictCheck.js
import { Alert } from 'react-native';
import { checkInviteConflicts } from '../../Slices/PostsSlice';

export async function runConflictCheckBeforeAccept({
  dispatch,
  userId,
  inviteId,
  dateTime,            // for drafts/edits
  windowMinutes = 120,
}) {
  if (!userId) return true;

  if (!inviteId && !dateTime) {
    console.warn(
      'runConflictCheckBeforeAccept called without inviteId or dateTime'
    );
    return true;
  }

  try {
    const { payload } = await dispatch(
      checkInviteConflicts({
        userId,
        inviteId,
        dateTime,
        windowMinutes,
      })
    );

    const conflicts = payload?.conflicts || [];
    if (!conflicts.length) return true;

    return await new Promise((resolve) => {
      Alert.alert(
        'You already have plans',
        'You have other plans around this time. Join this one anyway?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: 'Join anyway',
            onPress: () => resolve(true),
          },
        ]
      );
    });
  } catch (err) {
    console.error('Error checking invite conflicts:', err);
    // fail open if the check blows up
    return true;
  }
}
