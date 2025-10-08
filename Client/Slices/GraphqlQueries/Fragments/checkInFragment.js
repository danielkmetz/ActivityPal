import { gql } from "@apollo/client";
import { COMMENTS_REPLIES_FRAGMENT } from "./commentsRepliesFragment";

export const CHECKIN_FRAGMENT = gql`
  ${ COMMENTS_REPLIES_FRAGMENT }

  fragment CheckInFields on CheckIn {
    _id
    businessName
    placeId
    message
    date
    userId
    fullName
    profilePicUrl
    type
    sortDate
    photos {
      _id
      photoKey
      url
      taggedUsers {
        userId
        fullName
        profilePicUrl
        x
        y
      }
    }
    taggedUsers {
      userId
      fullName
    }
    comments {
      ...CommentsRepliesFields
    }
    likes {
      userId
      fullName
    }
  }
`;
