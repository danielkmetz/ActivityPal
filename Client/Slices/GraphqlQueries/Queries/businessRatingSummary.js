import { gql } from "@apollo/client";
import { BUSINESS_RATING_SUMMARY_FRAGMENT } from "../Fragments/businessRatingsFragment";

export const GET_BUSINESS_RATING_SUMMARIES = gql`
  query GetBusinessRatingSummaries($placeIds: [String!]!) {
    getBusinessRatingSummaries(placeIds: $placeIds) {
      ...BusinessRatingSummaryFields
    }
  }
  ${BUSINESS_RATING_SUMMARY_FRAGMENT}
`;