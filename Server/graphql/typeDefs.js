const { gql } = require('graphql-tag')

// Define GraphQL Schema
const typeDefs = gql`
  scalar Date

  # ✅ Unified User Activity Type (Includes Reviews & Check-ins)
  type UserActivity {
    _id: ID!
    userId: ID!
    fullName: String!
    placeId: String!
    businessName: String
    message: String
    reviewText: String
    rating: Int
    date: String
    photos: [Photo!]
    likes: [Like!]
    comments: [Comment!]
    profilePicUrl: String
    profilePic: ProfilePic
    taggedUsers: [TaggedUser!]
    type: String! # ✅ Used to distinguish reviews from check-ins
  }

  type User {
    id: ID!
    firstName: String
    lastName: String
    fullName: String
    profilePicUrl: String
    profilePic: ProfilePic
  }

  # ✅ Review Type
  type Review {
    _id: ID!
    businessName: String! 
    placeId: String! 
    rating: Int!
    reviewText: String!
    date: Date!
    likes: [Like]
    comments: [Comment]
    userId: ID!
    fullName: String!
    profilePic: ProfilePic
    profilePicUrl: String
    taggedUsers: [TaggedUser]
    photos: [Photo!]
    type: String!
    sortDate: String
  }

  # ✅ Check-In Type
  type CheckIn {
    _id: ID!
    date: Date!
    userId: ID!
    fullName: String!
    placeId: String!
    businessName: String!
    message: String
    photos: [Photo!]
    profilePic: ProfilePic
    profilePicUrl: String
    comments: [Comment]
    likes: [Like]
    taggedUsers: [TaggedUser]
    type: String! # ✅ Used to distinguish between reviews and check-ins in frontend
    sortDate: String
  }

  type ActivityInvite {
    _id: ID!
    sender: InviteUser!
    recipients: [InviteRecipient!]!
    placeId: String!
    businessName: String!
    businessLogoUrl: String
    note: String
    dateTime: String!
    message: String
    isPublic: Boolean!
    status: String!
    createdAt: String!
    likes: [Like]
    comments: [Comment]
    type: String!
    requests: [Request]
    sortDate: String
  }

  input ActivityCursor {
    sortDate: String!
    id: ID!
  }

  type Request {
    _id: ID!
    userId: ID!
    status: String!
    firstName: String
    lastName: String
    profilePicUrl: String
  }

  type InviteUser {
    id: ID!
    firstName: String
    lastName: String
    profilePicUrl: String
  }
    
  type InviteRecipient {
    user: InviteUser!
    status: String!
  }

  # ✅ Photo Type
  type Photo {
    _id: ID!
    photoKey: String!
    uploadedBy: String!
    description: String
    taggedUsers: [TaggedUser]
    uploadDate: Date!
    url: String # ✅ Added field for pre-signed URL
  }

  # ✅ Profile Picture Type
  type ProfilePic {
    _id: ID!
    photoKey: String!
    uploadedBy: String!
    description: String
    tags: [String]
    uploadDate: String!
  }

  type TaggedUser {
    userId: ID!
    fullName: String
    x: Float
    y: Float
  }

  # ✅ Likes
  type Like {
    userId: ID!
    fullName: String!
  }

  # ✅ Comments & Replies (Nested)
  type Comment {
    _id: ID!
    commentText: String!
    userId: ID!
    fullName: String!
    replies: [Reply!]
    likes: [ID]
    date: Date!
  }

  type Reply {
    _id: ID!
    commentText: String!
    userId: ID!
    fullName: String!
    replies: [Reply!]
    likes: [ID]
    date: Date!
  }

  type FollowersAndFollowing {
    followers: [User!]!
    following: [User!]!
  }

  type MutualUser {
    _id: ID!
    firstName: String
    lastName: String
    profilePic: ProfilePic
    profilePicUrl: String
  }

  type SuggestedUser {
    _id: ID!
    firstName: String
    lastName: String
    fullName: String
    profilePicUrl: String
    profilePic: ProfilePic
    mutualConnections: [MutualUser!]!
    profileVisibility: String!
    reviews: [Review!]!
    checkIns: [CheckIn!]!
  }

  type Story {
    _id: ID!
    mediaKey: String!
    mediaType: String!
    caption: String
    visibility: String
    expiresAt: String
    taggedUsers: [TaggedUser]
    mediaUrl: String
    profilePicUrl: String
    user: UserSummary!
    viewedBy: [UserSummary!]           # Array of user IDs who have viewed the story
    isViewed: Boolean         # Derived field, based on current user context
  }

  type UserSummary {
    _id: ID!
    firstName: String!
    lastName: String!
    profilePicUrl: String
  }

  type UserAndFriendsInvites {
    user: User!
    userInvites: [ActivityInvite!]!
    friendPublicInvites: [ActivityInvite!]!
  }

  union UserActivity = Review | CheckIn | ActivityInvite
  union UserPost = Review | CheckIn

  # ✅ Queries
  type Query {
    getUserAndFollowingReviews(userId: String!): [Review!]
    getUserPosts(userId: ID!, limit: Int, after: ActivityCursor): [UserPost!]
    getBusinessReviews(placeId: String!, limit: Int, after: ActivityCursor): [UserPost!]
    getUserAndFollowingCheckIns(userId: String!): [CheckIn!]
    getUserAndFollowingInvites(userId: ID!): UserAndFriendsInvites
    getUserActivity(userId: ID!, limit: Int, after: ActivityCursor): [UserActivity!]
    getSuggestedFollows(userId: ID!): [SuggestedUser!]!
    userAndFollowingStories(userId: ID!): [Story]
    storiesByUser(userId: ID!): [Story]
  }
`;

module.exports = typeDefs;