import { gql } from '@apollo/client';
import { COMMENTS_REPLIES_FRAGMENT } from './commentsRepliesFragment';

export const POST_FIELDS = gql`
  ${COMMENTS_REPLIES_FRAGMENT}

  fragment PostFields on Post {
    _id
    type
    message
    placeId
    privacy
    visibility
    sortDate
    createdAt
    updatedAt
    businessName

    owner {
      __typename
      ... on User {
        id
        firstName
        lastName
        fullName
        profilePicUrl
      }
      ... on Business {
        id
        businessName
        logoUrl
        placeId
      }
    }

    media {
      _id
      photoKey
      uploadedBy
      description
      uploadDate
      url
      taggedUsers {
        userId
        fullName
        profilePicUrl
        x
        y
      }
    }

    likes {
      userId
      fullName
    }

    comments {
      ...CommentsRepliesFields
    }

    details {
      ... on ReviewDetails {
        rating
        reviewText
        priceRating
        atmosphereRating
        serviceRating
        wouldRecommend
        fullName
      }
      ... on CheckInDetails {
        date
      }
      ... on InviteDetails {
        dateTime
        recipients {
          user {
            id
            firstName
            lastName
            profilePicUrl
          }
          status
        }
        requests {
          _id
          userId
          status
          firstName
          lastName
          profilePicUrl
        }
      }
      ... on EventDetails {
        startsAt
        endsAt
        hostId
      }
      ... on PromotionDetails {
        startsAt
        endsAt
        discountPct
        code
      }
      ... on LiveStreamDetails {
        title
        status
        coverKey
        durationSec
        viewerPeak
        startedAt
        endedAt
        playbackUrl
        vodUrl
      }
    }
  }
`;
