import { gql } from "@apollo/client";

export const BUSINESS_RATING_SUMMARY_FRAGMENT = gql`
  fragment BusinessRatingSummaryFields on BusinessRatingSummary {
    placeId
    averageRating
    averagePriceRating
    averageServiceRating
    averageAtmosphereRating
    recommendPercentage
  }
`;
