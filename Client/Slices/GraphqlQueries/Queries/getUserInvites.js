import { gql } from '@apollo/client';
import { POST_FIELDS } from '../Fragments/postFragment';

export const GET_USER_INVITES_QUERY = gql`
  ${POST_FIELDS}

  query GetUserInvites($limit: Int, $after: ActivityCursor) {
    getUserInvites(limit: $limit, after: $after) {
      ...PostFields
    }
  }
`;
