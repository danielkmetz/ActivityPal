import { gql } from '@apollo/client';
import { REVIEW_FRAGMENT } from './reviewFragment';
import { CHECKIN_FRAGMENT } from './checkInFragment';
import { INVITE_FRAGMENT } from './inviteFragment';
import { PROMOTION_FRAGMENT } from './promotionFragment';
import { EVENT_FRAGMENT } from './eventFragment';
import { COMMENTS_REPLIES_FRAGMENT } from './commentsRepliesFragment';

export const STORIES_QUERY = gql`
  query UserAndFollowingStories($userId: ID!) {
    userAndFollowingStories(userId: $userId) {
      _id
      profilePicUrl
      user {
        id
        firstName
        lastName
        profilePicUrl
      }
      stories {
        _id
        mediaKey
        mediaType
        captions {
          text
          y
          fontSize
          backgroundColor
          color
          width
        }
        visibility
        expiresAt
        mediaUrl
        type
        postType
        profilePicUrl
        original {
          __typename
          ... on Review {
            ...ReviewFields
          }
          ... on CheckIn {
            ...CheckInFields
          }
          ... on ActivityInvite {
            ...InviteFields
          }
          ... on Promotion {
            ...PromotionFields
          }
          ... on Event {
            ...EventFields
          }
        }
        viewedBy {
          id
          firstName
          lastName
          profilePicUrl
        }
        user {
          __typename
          ... on User {
            id
            firstName
            lastName
            profilePicUrl
          }
          ... on Business {
            id
            businessName
            logoUrl
          }
        }
      }
    }
  }

  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}
  ${INVITE_FRAGMENT}
  ${PROMOTION_FRAGMENT}
  ${EVENT_FRAGMENT}
  ${COMMENTS_REPLIES_FRAGMENT}
`;

export const STORIES_BY_USER_QUERY = gql`
  query StoriesByUser($userId: ID!) {
    storiesByUser(userId: $userId) {
      _id
      mediaKey
      mediaType
      captions
      visibility
      expiresAt
      mediaUrl
      profilePicUrl
      type
      postType
      original {
        __typename
        ... on Review {
          ...ReviewFields
        }
        ... on CheckIn {
          ...CheckInFields
        }
        ... on ActivityInvite {
          ...InviteFields
        }
        ... on Promotion {
          ...PromotionFields
        }
        ... on Event {
          ...EventFields
        }
      }
      viewedBy {
        id
        firstName
        lastName
        profilePicUrl
      }
      user {
        __typename
        ... on User {
          id
          firstName
          lastName
          profilePicUrl
        }
        ... on Business {
          id
          businessName
          logoUrl
        }
      }
    }
  }

  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}
  ${INVITE_FRAGMENT}
  ${PROMOTION_FRAGMENT}
  ${EVENT_FRAGMENT}
  ${COMMENTS_REPLIES_FRAGMENT}
`;