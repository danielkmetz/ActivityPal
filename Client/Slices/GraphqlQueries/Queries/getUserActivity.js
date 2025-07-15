import { gql } from '@apollo/client';
import { REVIEW_FRAGMENT } from '../Fragments/reviewFragment';
import { CHECKIN_FRAGMENT } from '../Fragments/checkInFragment';
import { INVITE_FRAGMENT } from '../Fragments/inviteFragment';
import { SHARED_POST_FRAGMENT } from '../Fragments/sharedPostFragment';

export const GET_USER_ACTIVITY_QUERY = gql`
  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}
  ${INVITE_FRAGMENT}
  ${SHARED_POST_FRAGMENT}

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
      ... on SharedPost {
        ...SharedPostFields
      }
    }
  }
`;
