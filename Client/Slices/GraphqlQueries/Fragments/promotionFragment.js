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
    startDate
    endDate
    sortDate
    createdAt
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
