import { REVIEW_FRAGMENT } from '../Fragments/reviewFragment';
import { CHECKIN_FRAGMENT } from '../Fragments/checkInFragment';
import { gql } from '@apollo/client';

export const GET_BUSINESS_REVIEWS_QUERY = gql`
  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}

  query GetBusinessReviews($placeId: String!, $limit: Int, $after: ActivityCursor) {
    getBusinessReviews(placeId: $placeId, limit: $limit, after: $after) {
      __typename
      ... on Review {
        ...ReviewFields
      }
      ... on CheckIn {
        ...CheckInFields
      }
    }
  }
`;
