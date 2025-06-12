import { REVIEW_FRAGMENT } from '../Fragments/reviewFragment';
import { CHECKIN_FRAGMENT } from '../Fragments/checkInFragment';

export const GET_USER_POSTS_QUERY = `
  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}

  query GetUserPosts($userId: ID!, $limit: Int, $after: ActivityCursor) {
    getUserPosts(userId: $userId, limit: $limit, after: $after) {
      ... on Review {
        ...ReviewFields
      }
      ... on CheckIn {
        ...CheckInFields
      }
    }
  }
`;
