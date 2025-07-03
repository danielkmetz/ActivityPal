import { gql } from "@apollo/client";

export const CHECKIN_FRAGMENT = gql`
  fragment CheckInFields on CheckIn {
    _id
    businessName
    placeId
    message
    date
    userId
    fullName
    profilePicUrl
    type
    sortDate
    photos {
      _id
      photoKey
      url
      taggedUsers {
        userId
        fullName
        x
        y
      }
    }
    taggedUsers {
      userId
      fullName
    }
    comments {
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
          mediaUrl
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
          mediaUrl
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
              mediaUrl
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
                mediaUrl
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
                  mediaUrl
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
                    mediaUrl
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
                      mediaUrl
                    }
                  date
                }
              }
            }
          }
        }
      }
    }
    likes {
      userId
      fullName
    }
  }
`;
