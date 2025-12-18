const { gql } = require('graphql-tag')

const typeDefs = gql`
  scalar Date
  scalar DateTime
  scalar JSON

  # -------- Core entities --------
  type User {
    id: ID!
    firstName: String
    lastName: String
    fullName: String
    profilePicUrl: String
    profilePic: ProfilePic
    privacySettings: UserPrivacySettings
  }

  type Business {
    id: ID!
    firstName: String
    lastName: String
    placeId: String!
    businessName: String
    location: Location
    logoKey: String
    logoUrl: String
  }

  type Location {
    type: String!
    coordinates: [Float!]       # [lng, lat]
    formattedAddress: String
  }

  # -------- One Post model --------
  type Post {
    _id: ID!
    type: String!                 # 'review' | 'check-in' | 'invite' | 'event' | 'promotion' | 'sharedPost' | 'liveStream'
    owner: OriginalOwner          # resolved from ownerId/ownerModel
    ownerId: ID
    ownerModel: String            # 'User' | 'Business'
    message: String               # canonical user-authored post text
    placeId: String
    location: Location
    media: [Photo!]
    taggedUsers: [TaggedUser]
    likes: [Like]
    comments: [Comment]
    stats: PostStats
    privacy: String               # 'public' | 'followers' | 'private' | 'unlisted'
    visibility: String            # 'visible' | 'hidden' | 'deleted'
    sortDate: DateTime
    createdAt: DateTime
    updatedAt: DateTime
    details: PostDetails          # per-type data (see union below)
    shared: SharedMeta            # present when type === 'sharedPost'
    refs: PostRefs                # cross-links (e.g., liveStream)
    businessName: String
    businessLogoUrl: String
    deletedAt: DateTime
    expireAt: DateTime
    
    # ✅ Hydrated live original (or omitted if not a sharedPost).
    # Your controller attaches this for response; default resolver will expose it.
    original: Post
  }

  type PostStats {
    likeCount: Int
    commentCount: Int
    shareCount: Int
  }

  # -------- Per-type "details" union --------
  union PostDetails =
      ReviewDetails
    | CheckInDetails
    | InviteDetails
    | EventDetails
    | PromotionDetails
    | LiveStreamDetails

  type ReviewDetails {
    rating: Int!
    wouldGoBack: Boolean!
    reviewText: String
    priceRating: Int
    vibeTags: [String!]
    fullName: String
    
    # legacy fields – still here for backwards compatibility, but you’re not really populating them anymore
    atmosphereRating: Int @deprecated(reason: "Legacy field; no longer collected for new reviews.")
    serviceRating: Int @deprecated(reason: "Legacy field; no longer collected for new reviews.")
    wouldRecommend: Boolean @deprecated(reason: "Replaced by wouldGoBack.")
  }

  type CheckInDetails {
    date: Date
  }

  type InviteDetails {
    dateTime: DateTime!
    timeZone: String
    recipients: [InviteRecipient!]!
    requests: [Request]
    went: String                     # 'unknown' | 'went' | 'did_not_go'
    needsRecap: Boolean
    recapReminderSentAt: DateTime
  }

  type EventDetails {
    startsAt: DateTime
    endsAt: DateTime
    hostId: ID
    title: String
    recurring: Boolean
    recurringDays: [String!]
    description: String
    allDay: Boolean
    address: String
  }

  type PromotionDetails {
    startsAt: DateTime
    endsAt: DateTime
    discountPct: Int
    code: String
    title: String
    recurring: Boolean
    recurringDays: [String!]
    description: String
    allDay: Boolean
    address: String
  }

  type LiveStreamDetails {
    title: String
    status: String              # 'idle' | 'live' | 'ended' | 'error'
    coverKey: String
    durationSec: Int
    viewerPeak: Int
    startedAt: DateTime
    endedAt: DateTime
    playbackUrl: String
    vodUrl: String
  }

  # -------- Sharing & refs --------
  type SharedMeta {
    originalPostId: ID!
    originalOwner: OriginalOwner
    originalOwnerModel: String

    # Hydrated snapshot in Post shape (enriched by the controller).
    snapshot: Post

    originalExists: Boolean
    originalAccessible: Boolean
  }

  type PostRefs {
    liveStreamId: ID
    liveStream: LiveStream
    relatedInviteId: ID
  }

  # LiveStream domain object (kept lightweight; social lives on Post)
  type LiveStream {
    _id: ID!
    playbackUrl: String
    vodUrl: String
    coverKey: String
    status: String
    startedAt: DateTime
    endedAt: DateTime
    durationSec: Int
  }

  # -------- Shared building blocks --------
  type Request {
    _id: ID
    userId: ID!
    status: String!
    firstName: String
    lastName: String
    profilePicUrl: String
  }

  type InviteRecipient {
    user: InviteUser!
    status: String!
    nudgedAt: DateTime
  }

  type InviteUser {
    id: ID!
    firstName: String
    lastName: String
    profilePicUrl: String
  }

  type Photo {
    _id: ID!
    photoKey: String
    uploadedBy: String!
    description: String
    taggedUsers: [TaggedUser]
    uploadDate: Date
    url: String
  }

  type ProfilePic {
    _id: ID!
    photoKey: String
    uploadedBy: String!
    description: String
    tags: [String]
    uploadDate: String
  }

  type TaggedUser {
    userId: ID!
    fullName: String
    profilePicUrl: String
    x: Float
    y: Float
  }

  type Like {
    userId: ID!
    fullName: String
  }

  type Media {
    photoKey: String
    mediaType: String
    url: String
  }

  type Comment {
    _id: ID!
    commentText: String!
    userId: ID!
    fullName: String
    replies: [Reply!]
    likes: [Like]
    media: Media
    date: Date
  }

  type Reply {
    _id: ID!
    commentText: String!
    userId: ID!
    fullName: String
    replies: [Reply!]
    likes: [Like]
    date: Date
    media: Media
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

  type UserPrivacySettings {
    profileVisibility: String!
    invites: String
    contentVisibility: String
    tagPermissions: String
    messagePermissions: String
  }

  type SuggestedUser {
    _id: ID!
    firstName: String
    lastName: String
    fullName: String
    profilePicUrl: String
    profilePic: ProfilePic
    mutualConnections: [MutualUser!]!
    privacySettings: UserPrivacySettings
    profileVisibility: String!
    posts: [Post!]!
  }

  type Caption {
    text: String!
    y: Float!
    fontSize: Int
    backgroundColor: String
    color: String
    width: Float!
  }

  type Story {
    _id: ID!
    mediaKey: String
    mediaType: String
    caption: String
    captions: [Caption]
    visibility: String
    expiresAt: String
    taggedUsers: [TaggedUser]
    mediaUrl: String
    profilePicUrl: String
    user: OriginalOwner
    viewedBy: [User!]
    type: String
    postType: String @deprecated(reason: "Use originalPost.type")
    originalPost: Post
    isViewed: Boolean
  }

  type StoryGroup {
    _id: ID!
    user: User!
    profilePicUrl: String
    stories: [Story!]!
  }

  type UserSummary {
    _id: ID!
    firstName: String!
    lastName: String!
    profilePicUrl: String
  }

  type BusinessRatingSummary {
    placeId: String!
    averageRating: Float!
    averagePriceRating: Float!
    averageServiceRating: Float!
    averageAtmosphereRating: Float!
    recommendPercentage: Int!
  }

  union OriginalOwner = User | Business

  input ActivityCursor {
    sortDate: String!
    id: ID!
  }

  # -------- Queries (Post-centric) --------
  type Query {
    getPostById(id: ID!): Post
    getUserPosts(userId: ID!, types: [String!], limit: Int, after: ActivityCursor): [Post!]
    getPostsByPlace(placeId: String!, types: [String!], limit: Int, after: ActivityCursor): [Post!]
    getUserActivity(types: [String!], limit: Int, after: ActivityCursor, userLat: Float, userLng: Float): [Post!]
    getUserTaggedPosts(userId: ID!, limit: Int, after: ActivityCursor): [Post!]

    getSuggestedFollows(userId: ID!): [SuggestedUser!]!
    userAndFollowingStories(userId: ID!): [StoryGroup]
    storiesByUser(userId: ID!): [StoryGroup]
    getBusinessRatingSummaries(placeIds: [String!]!): [BusinessRatingSummary!]!
    getUserInvites(limit: Int, after: ActivityCursor): [Post!]
  }
`

module.exports = typeDefs
