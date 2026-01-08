import { gql } from '@apollo/client';
import { TAGGED_USER_FRAGMENT } from './taggedUserFragment';
import { USER_CORE_FIELDS } from './userFragment';
import { VENUE_FIELDS } from './venueFragment';

/**
 * For nested posts (shared original, snapshotPost).
 * IMPORTANT: Do NOT include `original` or `shared` here to avoid recursion.
 * Keep it lightweight (no comments/likes) unless you truly need them.
 */
export const NESTED_POST_FIELDS = gql`
  ${TAGGED_USER_FRAGMENT}
  ${USER_CORE_FIELDS}
  ${VENUE_FIELDS}

  fragment NestedPostFields on Post {
    _id
    type
    message
    placeId
    businessName
    businessLogoUrl
    privacy
    visibility
    sortDate
    createdAt
    updatedAt

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

    venue {
      ...VenueFields
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

    refs {
      relatedInviteId
    }

    details {
      ... on ReviewDetails {
        rating           
        wouldGoBack      
        reviewText       
        priceRating      
        vibeTags         
        fullName         
      }
      ... on CheckInDetails {
        date
      }
      ... on InviteDetails {
        dateTime
        needsRecap
        recipients {
          user {
            id
            firstName
            lastName
            profilePicUrl
          }
          status
          nudgedAt
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
        allDay
        recurring
        recurringDays
        address
        title
        description
      }
      ... on PromotionDetails {
        allDay
        recurring
        recurringDays
        address
        title
        description
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
    snapshot {
      ...NestedPostFields
    }

    # Optional booleans your server may set
    originalExists
    originalAccessible
  }
`;