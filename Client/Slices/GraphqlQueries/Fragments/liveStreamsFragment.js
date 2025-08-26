import { gql } from "@apollo/client";
import { COMMENTS_REPLIES_FRAGMENT } from "./commentsRepliesFragment";

export const LIVE_STREAM_FRAGMENT = gql`
 ${COMMENTS_REPLIES_FRAGMENT}
  fragment LiveStreamFields on LiveStreamFeedItem {
    _id
    userId
    placeId

    fullName
    profilePicUrl
    profilePic

    message
    date

    playbackUrl
    vodUrl
    coverKey
    previewThumbUrl
    durationSecs

    isLive
    startedAt
    endedAt

    type
    visibility
    isPosted
    postId

    taggedUsers {
      userId
      fullName
    }

    likes {
      userId
      fullName
    }

    comments { ...CommentsRepliesFields }
  }
`;