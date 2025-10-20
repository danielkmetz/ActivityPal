import { REVIEW_FRAGMENT } from '../Fragments/reviewFragment';
import { CHECKIN_FRAGMENT } from '../Fragments/checkInFragment';
import { gql } from '@apollo/client';

export const GET_USER_TAGGED_POSTS_QUERY = gql`
  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}

  query GetUserTaggedPosts($userId: ID!, $limit: Int, $after: ActivityCursor) {
    getUserTaggedPosts(userId: $userId, limit: $limit, after: $after) {
      ... on Review {
        ...ReviewFields
      }
      ... on CheckIn {
        ...CheckInFields
      }
    }
  }
`;
