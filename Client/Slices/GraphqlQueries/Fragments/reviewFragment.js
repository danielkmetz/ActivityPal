import { gql } from "@apollo/client";
import { COMMENTS_REPLIES_FRAGMENT } from "./commentsRepliesFragment";

export const REVIEW_FRAGMENT = gql`
  ${COMMENTS_REPLIES_FRAGMENT}

  fragment ReviewFields on Review {
    _id
    businessName
    placeId
    rating
    priceRating
    serviceRating
    atmosphereRating
    wouldRecommend
    reviewText
    date
    likes {
      userId
      fullName
    }
    comments {
      ...CommentsRepliesFields
    }
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
        x
        y
      }
    }
    taggedUsers {
      userId
      fullName
    }
  }
`;
