import { gql } from "@apollo/client";

export const COMMENTS_REPLIES_FRAGMENT = gql`
  fragment CommentsRepliesFields on Comment {
    _id
    commentText
    userId
    fullName
    likes {
      userId
      fullName
    }
    date
    media {
      photoKey
      mediaType
      url
    }
    replies {
      _id
      commentText
      userId
      fullName
      likes {
        userId
        fullName
      }
      media {
        photoKey
        mediaType
        url
      }
      date
      replies {
        _id
        commentText
        userId
        fullName
        likes {
          userId
          fullName
        }
        media {
          photoKey
          mediaType
          url
        }
        date
        replies {
          _id
          commentText
          userId
          fullName
          likes {
            userId
            fullName
          }
          media {
            photoKey
            mediaType
            url
          }
          date
          replies {
            _id
            commentText
            userId
            fullName
            likes {
              userId
              fullName
            }
            media {
              photoKey
              mediaType
              url
            }
            date
            replies {
              _id
              commentText
              userId
              fullName
              likes {
                userId
                fullName
              }
              media {
                photoKey
                mediaType
                url
              }
              date
            }
          }
        }
      }
    }
  }
`;
