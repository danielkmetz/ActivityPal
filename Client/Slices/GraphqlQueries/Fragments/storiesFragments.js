import { gql } from '@apollo/client';
import { POST_FIELDS } from './postFragment';

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
        originalPost {
          ...PostFields
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
  ${POST_FIELDS}
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
      originalPost {
        ...PostFields
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
  ${POST_FIELDS}
`;
