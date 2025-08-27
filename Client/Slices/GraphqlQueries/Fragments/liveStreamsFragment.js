import { gql } from "@apollo/client";
import { COMMENTS_REPLIES_FRAGMENT } from "./commentsRepliesFragment";

export const LIVE_STREAM_FRAGMENT = gql`
 ${COMMENTS_REPLIES_FRAGMENT}
  fragment LiveStreamFields on LiveStream {
    _id
    userId
    fullName
    profilePicUrl
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
    caption
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