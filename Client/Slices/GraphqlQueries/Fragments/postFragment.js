import { gql } from '@apollo/client';
import { COMMENTS_REPLIES_FRAGMENT } from './commentsRepliesFragment';
import { TAGGED_USER_FRAGMENT } from './taggedUserFragment';
import { NESTED_POST_FIELDS, SHARED_META_FIELDS } from './nestedPostFields';
import { USER_CORE_FIELDS } from './userFragment';

export const POST_FIELDS = gql`
  ${COMMENTS_REPLIES_FRAGMENT}
  ${TAGGED_USER_FRAGMENT}
  ${NESTED_POST_FIELDS}
  ${SHARED_META_FIELDS}
  ${USER_CORE_FIELDS}

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
    businessLogoUrl

    taggedUsers {
      ...TaggedUserFields
    }

    owner {
      __typename
      ... on User {
        ...UserCoreFields
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
        ...TaggedUserFields
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

    # ✅ NEW: shared metadata + typed snapshot
    shared {
      ...SharedMetaFields
    }

    # ✅ NEW: hydrated live original for shared posts
    original {
      ...NestedPostFields
    }
  }
`;