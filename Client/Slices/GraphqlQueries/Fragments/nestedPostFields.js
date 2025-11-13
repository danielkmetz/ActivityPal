import { gql } from '@apollo/client';
import { TAGGED_USER_FRAGMENT } from './taggedUserFragment';

/**
 * For nested posts (shared original, snapshotPost).
 * IMPORTANT: Do NOT include `original` or `shared` here to avoid recursion.
 * Keep it lightweight (no comments/likes) unless you truly need them.
 */
export const NESTED_POST_FIELDS = gql`
  ${TAGGED_USER_FRAGMENT}

  fragment NestedPostFields on Post {
    _id
    type
    message
    placeId
    businessName
    privacy
    visibility
    sortDate
    createdAt
    updatedAt

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

    taggedUsers {
      ...TaggedUserFields
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

/**
 * Shared meta gets its own fragment so we can reuse it anywhere.
 * We expose both `snapshot` (deprecated) and the new typed `snapshotPost`.
 */
export const SHARED_META_FIELDS = gql`
  ${NESTED_POST_FIELDS}

  fragment SharedMetaFields on SharedMeta {
    originalPostId
    originalOwnerModel

    originalOwner {
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

    # New, fully-typed enriched snapshot
    snapshotPost {
      ...NestedPostFields
    }

    # Optional booleans your server may set
    originalExists
    originalAccessible
  }
`;