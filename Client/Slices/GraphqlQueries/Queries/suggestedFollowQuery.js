import { REVIEW_FRAGMENT } from "../Fragments/reviewFragment";
import { CHECKIN_FRAGMENT } from "../Fragments/checkInFragment";
import { gql } from "@apollo/client";

export const GET_SUGGESTED_FOLLOWS_QUERY = gql`
  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}

  query GetSuggestedFollows($userId: ID!) {
    getSuggestedFollows(userId: $userId) {
      _id
      firstName
      lastName
      fullName
      profilePicUrl
      profilePic {
        _id
        photoKey
        uploadedBy
        description
        tags
        uploadDate
      }
      mutualConnections {
        _id
        firstName
        lastName
        profilePic {
          _id
          photoKey
          uploadedBy
          description
          tags
          uploadDate
        }
        profilePicUrl
      }
      profileVisibility
      reviews { ...ReviewFields }
      checkIns { ...CheckInFields }
    }
  }
`;