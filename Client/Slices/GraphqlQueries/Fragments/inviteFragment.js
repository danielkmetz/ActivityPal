import { gql } from "@apollo/client";

export const INVITE_FRAGMENT = gql`
  fragment InviteFields on ActivityInvite {
    _id
    sender {
      id
      firstName
      lastName
      profilePicUrl
    }
    recipients {
      user {
        id
        firstName
        lastName
        profilePicUrl
      }
      status
    }
    placeId
    businessName
    businessLogoUrl
    note
    dateTime
    sortDate
    message
    isPublic
    status
    createdAt
    type
    requests {
      _id
      userId
      status
      firstName
      lastName
      profilePicUrl
    }
    likes {
      userId
      fullName
    }
    comments {
      _id
      userId
      fullName
      commentText
      likes
      date
      replies {
        _id
        userId
        fullName
        commentText
        likes
        date
        replies {
            _id
            userId
            fullName
            commentText
            likes
            date
            replies {
                _id
                userId
                fullName
                commentText
                likes
                date
                replies {
                    _id
                    userId
                    fullName
                    commentText
                    likes
                    date
                    replies {
                        _id
                        userId
                        fullName
                        commentText
                        likes
                        date
                        replies {
                            _id
                            userId
                            fullName
                            commentText
                            likes
                            date
                            replies {
                                _id
                                userId
                                fullName
                                commentText
                                likes
                                date
                                replies {
                                    _id
                                    userId
                                    fullName
                                    commentText
                                    likes
                                    date
                                }
                            }
                        }
                    }
                }
            }
        }
      }
    }
  }
`;
