import { gql } from "@apollo/client";
import { REVIEW_FRAGMENT } from "./reviewFragment";
import { CHECKIN_FRAGMENT } from "./checkInFragment";
import { INVITE_FRAGMENT } from "./inviteFragment";
import { PROMOTION_FRAGMENT } from "./promotionFragment";
import { EVENT_FRAGMENT } from "./eventFragment";
import { LIVE_STREAM_FRAGMENT } from "./liveStreamsFragment";
import { COMMENTS_REPLIES_FRAGMENT } from './commentsRepliesFragment';

export const SHARED_POST_FRAGMENT = gql`
  fragment SharedPostFields on SharedPost {
    _id
    postType
    caption
    originalPostId
    createdAt
    sortDate
    type

    user {
      id
      firstName
      lastName
      profilePic {
        photoKey
        uploadDate
        description
      }
      profilePicUrl
    }

    originalOwner {
      id
      firstName
      lastName
      profilePic {
        photoKey
        uploadDate
        description
      }
      profilePicUrl
    }

    comments {
      ...CommentsRepliesFields
    }

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
      ... on LiveStream {
        ...LiveStreamFields
      }
    }
  }

  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}
  ${INVITE_FRAGMENT}
  ${PROMOTION_FRAGMENT}
  ${EVENT_FRAGMENT}
  ${COMMENTS_REPLIES_FRAGMENT}
  ${LIVE_STREAM_FRAGMENT}
`;
