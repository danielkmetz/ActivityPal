import { gql } from '@apollo/client';
import { POST_FIELDS } from '../Fragments/postFragment'; // ← your new unified Post fragment

export const GET_USER_ACTIVITY_QUERY = gql`
  ${POST_FIELDS}

  query GetUserActivity($limit: Int, $after: ActivityCursor, $userLat: Float, $userLng: Float) {
    getUserActivity(limit: $limit, after: $after, userLat: $userLat, userLng: $userLng) {
      ...PostFields
    }
  }
`;
