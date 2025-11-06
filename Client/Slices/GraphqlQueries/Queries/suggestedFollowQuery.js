import { gql } from "@apollo/client";
import { POST_FIELDS } from "../Fragments/postFragment";

export const GET_SUGGESTED_FOLLOWS_QUERY = gql`
  ${POST_FIELDS}

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
      posts {
        ...PostFields
      }
    }
  }
`;
