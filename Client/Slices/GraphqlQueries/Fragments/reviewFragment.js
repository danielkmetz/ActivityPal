import { gql } from "@apollo/client";

export const REVIEW_FRAGMENT = gql`
  fragment ReviewFields on Review {
    _id
    businessName
    placeId
    rating
    priceRating
    serviceRating
    atmosphereRating
    wouldRecommend
    reviewText
    date
    likes {
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
                  date
                }
              }
            }
          }
        }
      }
    }
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
  }
`;
