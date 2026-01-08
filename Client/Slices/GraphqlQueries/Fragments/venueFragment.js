import { gql } from "@apollo/client";

export const VENUE_FIELDS = gql`
  fragment VenueFields on Venue {
    kind
    label
    placeId
    address
    geo {
      type
      coordinates
      formattedAddress
    }
  }
`;
