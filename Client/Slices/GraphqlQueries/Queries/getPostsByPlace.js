import { gql } from '@apollo/client';
import { POST_FIELDS } from '../Fragments/postFragment';

export const GET_POSTS_BY_PLACE_QUERY = gql`
  ${POST_FIELDS}

  query GetPostsByPlace($placeId: String!, $limit: Int, $after: ActivityCursor) {
    getPostsByPlace(placeId: $placeId, limit: $limit, after: $after) {
      ...PostFields
    }
  }
`;
