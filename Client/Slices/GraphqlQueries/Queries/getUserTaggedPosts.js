import { gql } from '@apollo/client';
import { POST_FIELDS } from '../Fragments/postFragment';

export const GET_USER_TAGGED_POSTS_QUERY = gql`
  ${POST_FIELDS}

  query GetUserTaggedPosts($userId: ID!, $limit: Int, $after: ActivityCursor) {
    getUserTaggedPosts(userId: $userId, limit: $limit, after: $after) {
      ...PostFields
    }
  }
`;
