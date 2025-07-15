import { gql } from "@apollo/client";
import { COMMENTS_REPLIES_FRAGMENT } from "./commentsRepliesFragment";

export const EVENT_FRAGMENT = gql`
  ${COMMENTS_REPLIES_FRAGMENT}

  fragment EventFields on Event {
    _id
    title
    description
    placeId
    businessName
    businessLogoUrl
    date
    timeStart
    timeEnd
    recurrenceDays
    sortDate
    createdAt
    type
    media {
      photoKey
      mediaType
      mediaUrl
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
