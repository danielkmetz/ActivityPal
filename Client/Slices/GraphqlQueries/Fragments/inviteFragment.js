import { gql } from "@apollo/client";
import { COMMENTS_REPLIES_FRAGMENT } from "./commentsRepliesFragment";

export const INVITE_FRAGMENT = gql`
  ${COMMENTS_REPLIES_FRAGMENT}

  fragment InviteFields on ActivityInvite {
    _id
    sender {
      id
      firstName
      lastName
      profilePicUrl
    }
    recipients {
      user {
        id
        firstName
        lastName
        profilePicUrl
      }
      status
    }
    placeId
    businessName
    businessLogoUrl
    note
    dateTime
    sortDate
    message
    isPublic
    status
    createdAt
    type
    requests {
      _id
      userId
      status
      firstName
      lastName
      profilePicUrl
    }
    likes {
      userId
      fullName
    }
    comments {
      ...CommentsRepliesFields
    }
  }
`;
