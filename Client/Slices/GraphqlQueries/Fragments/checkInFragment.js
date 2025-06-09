export const CHECKIN_FRAGMENT = `
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
      likes
      date
      replies {
        _id
        commentText
        userId
        fullName
        likes
        date
        replies {
          _id
          commentText
          userId
          fullName
          likes
          date
          replies {
            _id
            commentText
            userId
            fullName
            likes
            date
            replies {
              _id
              commentText
              userId
              fullName
              likes
              date
              replies {
                _id
                commentText
                userId
                fullName
                likes
                date
                replies {
                  _id
                  commentText
                  userId
                  fullName
                  likes
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
