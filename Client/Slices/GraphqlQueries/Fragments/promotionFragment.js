import { gql } from "@apollo/client";
import { COMMENTS_REPLIES_FRAGMENT } from "./commentsRepliesFragment";

export const PROMOTION_FRAGMENT = gql`
  ${ COMMENTS_REPLIES_FRAGMENT }
  
  fragment PromotionFields on Promotion {
    _id
    title
    description
    placeId
    businessName
    businessLogoUrl
    formattedAddress
    distance
    startDate
    endDate
    sortDate
    createdAt
    recurringDays
    startTime
    endTime
    allDay
    type
    media {
      photoKey
      mediaType
      url
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
