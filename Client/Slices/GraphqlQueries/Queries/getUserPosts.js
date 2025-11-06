import { gql } from '@apollo/client';
import { POST_FIELDS } from '../Fragments/postFragment';

export const GET_USER_POSTS_QUERY = gql`
  ${POST_FIELDS}

  query GetUserPosts($userId: ID!, $types: [String!], $limit: Int, $after: ActivityCursor) {
    getUserPosts(userId: $userId, types: $types, limit: $limit, after: $after) {
      ...PostFields
    }
  }
`;
