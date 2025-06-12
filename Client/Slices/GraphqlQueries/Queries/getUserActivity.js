import { REVIEW_FRAGMENT } from '../Fragments/reviewFragment';
import { CHECKIN_FRAGMENT } from '../Fragments/checkInFragment';
import { INVITE_FRAGMENT } from '../Fragments/inviteFragment';

export const GET_USER_ACTIVITY_QUERY = `
  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}
  ${INVITE_FRAGMENT}

  query GetUserActivity($userId: ID!, $limit: Int, $after: ActivityCursor) {
    getUserActivity(userId: $userId, limit: $limit, after: $after) {
      ... on Review {
        ...ReviewFields
      }
      ... on CheckIn {
        ...CheckInFields
      }
      ... on ActivityInvite {
        ...InviteFields
      }
    }
  }
`;
