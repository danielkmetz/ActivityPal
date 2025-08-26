import { REVIEW_FRAGMENT } from '../Fragments/reviewFragment';
import { CHECKIN_FRAGMENT } from '../Fragments/checkInFragment';
import { SHARED_POST_FRAGMENT } from '../Fragments/sharedPostFragment';
import { LIVE_STREAM_FRAGMENT } from '../Fragments/liveStreamsFragment'; 
import { gql } from '@apollo/client';

export const GET_USER_POSTS_QUERY = gql`
  ${REVIEW_FRAGMENT}
  ${CHECKIN_FRAGMENT}
  ${SHARED_POST_FRAGMENT}
  ${LIVE_STREAM_FRAGMENT}

  query GetUserPosts($userId: ID!, $limit: Int, $after: ActivityCursor) {
    getUserPosts(userId: $userId, limit: $limit, after: $after) {
      ... on Review {
        ...ReviewFields
      }
      ... on CheckIn {
        ...CheckInFields
      }
      ... on SharedPost {
        ...SharedPostFields
      }
      ... on LiveStream {
        ...LiveStreamFields
      }
    }
  }
`;
