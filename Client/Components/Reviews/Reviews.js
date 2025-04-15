import React, { useState, useRef } from "react";
import {
  StyleSheet,
  FlatList,
  Animated,
} from "react-native";
import { toggleLike, deleteReview, editReview } from "../../Slices/ReviewsSlice";
import { editCheckIn } from "../../Slices/CheckInsSlice";
import { editInvite } from "../../Slices/InvitesSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import CommentModal from "./CommentModal";
import { createNotification } from "../../Slices/NotificationsSlice";
import InviteCard from "./InviteCard";
import ReviewItem from "./ReviewItem";
import CheckInItem from "./CheckInItem";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function Reviews({ reviews, ListHeaderComponent, scrollY, onScroll }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const [selectedReview, setSelectedReview] = useState(null); // For the modal
  const [photoTapped, setPhotoTapped] = useState(null);
  const lastTapRef = useRef({});
  const [likedAnimations, setLikedAnimations] = useState({});
  const scrollX = useRef(new Animated.Value(0)).current;

  const userId = user?.id
  const fullName = `${user?.firstName} ${user?.lastName}`;

  const handleOpenComments = (review) => {
    setSelectedReview(review);
  };

  const handleCloseComments = () => {
    setSelectedReview(null);
  };

  const handleLike = async (postType, postId) => {
    // Determine where to find the post (reviews for businesses, check-ins for users)
    const postToUpdate = reviews.find((review) => review._id === postId);

    if (!postToUpdate) {
      console.error(`${postType} with ID ${postId} not found.`);
      return;
    }

    const placeId = postToUpdate.placeId;

    try {
      // Sync with the backend
      const { payload } = await dispatch(toggleLike({ postType, placeId, postId, userId, fullName }));

      // Check if the current user's ID exists in the likes array before sending a notification
      const userLiked = payload?.likes?.some((like) => like.userId === userId);

      // Dynamically get ownerId based on postType
      let ownerId;
      if (postType === 'invite') {
        ownerId = postToUpdate.sender?.id || postToUpdate.senderId;
      } else {
        ownerId = postToUpdate.userId;
      }

      // Create a notification for the post owner
      if (userLiked && ownerId !== userId) { // Avoid self-notifications
        await dispatch(createNotification({
          userId: ownerId,
          type: 'like',
          message: `${fullName} liked your ${postType}.`,
          relatedId: userId,
          typeRef: postType === 'review' ? 'Review' : postType === 'check-in' ? 'CheckIn' : 'ActivityInvite',
          targetId: postId,
          postType,
        }));
      }
    } catch (error) {
      console.error(`Error toggling like for ${postType}:`, error);
    }
  };

  const handleLikeWithAnimation = async (postType, postId) => {
    const now = Date.now();

    if (!lastTapRef.current || typeof lastTapRef.current !== "object") {
      lastTapRef.current = {};
    }

    if (!lastTapRef.current[postId]) {
      lastTapRef.current[postId] = 0;
    }

    if (now - lastTapRef.current[postId] < 300) {
      const postBeforeUpdate = reviews.find((review) => review._id === postId);
      const wasLikedBefore = postBeforeUpdate?.likes?.some((like) => like.userId === user?.id);

      await handleLike(postType, postId);

      if (!wasLikedBefore) {
        if (!likedAnimations[postId]) {
          setLikedAnimations((prev) => ({
            ...prev,
            [postId]: new Animated.Value(0),
          }));
        }

        const animation = likedAnimations[postId] || new Animated.Value(0);

        Animated.timing(animation, {
          toValue: 1,
          duration: 50,
          useNativeDriver: true,
        }).start(() => {
          setTimeout(() => {
            Animated.timing(animation, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }).start();
          }, 500);
        });

        setLikedAnimations((prev) => ({
          ...prev,
          [postId]: animation,
        }));
      }
    }

    lastTapRef.current[postId] = now;
  };

  const toggleTaggedUsers = (photoKey) => {
    setPhotoTapped(photoTapped === photoKey ? null : photoKey);
  };

  const handleDeletePost = async (post) => {
    try {
      if (post.type === 'review') {
        const placeId = post.placeId;
        const reviewId = post._id;
        await dispatch(deleteReview({ placeId, reviewId }));
      } else if (post.type === 'check-in') {
        const checkInId = post._id;
        await dispatch(deleteCheckIn(checkInId));
      } else if (post.type === 'invite') {
        const senderId = post.senderId || post.sender?.id;
        const inviteId = post._id;
        const recipientIds = post.recipients?.map((r) => r.id || r._id) || [];
        await dispatch(deleteInvite({ senderId, inviteId, recipientIds }));
      } else {
        console.warn('Unsupported post type:', post.type);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const handleEditPost = async (post, updates) => {
    try {
      if (post.type === 'review') {
        const payload = {
          placeId: post.placeId,
          reviewId: post._id,
          rating: updates.rating,
          reviewText: updates.reviewText,
          taggedUsers: updates.taggedUsers || [],
          photos: updates.photos || [],
        };
        await dispatch(editReview(payload));
      } else if (post.type === 'check-in') {
        const payload = {
          id: post._id,
          updatedData: updates,
        };
        await dispatch(editCheckIn(payload));
      } else if (post.type === 'invite') {
        const payload = {
          inviteId: post._id,
          recipientId: post.senderId || post.sender?.id,
          recipientIds: updates.recipientIds || post.recipients?.map(r => r._id || r.id) || [],
          updates,
        };
        await dispatch(editInvite(payload));
      } else {
        console.warn("Unsupported post type for editing:", post.type);
      }
    } catch (error) {
      console.error("Error editing post:", error);
    }
  };

  return (
    <>
      <AnimatedFlatList
        data={reviews}
        extraData={reviews}
        keyExtractor={(item, index) => (item._id || item.id || index).toString()}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        onScroll={
          scrollY
            ? Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              {
                useNativeDriver: true,
                listener: onScroll,
              }
            )
            : onScroll || undefined
        }
        scrollEventThrottle={16}
        renderItem={({ item }) => {
          if (item.type === 'invite') {
            return (
              <InviteCard 
                invite={item} 
                handleLike={handleLike} 
                handleOpenComments={handleOpenComments} 
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
              />
            )
          }

          if (item.type === "check-in") {
            return (
              <CheckInItem
                item={item}
                scrollX={scrollX}
                likedAnimations={likedAnimations}
                photoTapped={photoTapped}
                toggleTaggedUsers={toggleTaggedUsers}
                handleLikeWithAnimation={handleLikeWithAnimation}
                handleLike={handleLike}
                handleOpenComments={handleOpenComments}
                lastTapRef={lastTapRef}
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
              />
            );
          }
          return (
            <ReviewItem
              item={item}
              scrollX={scrollX}
              likedAnimations={likedAnimations}
              photoTapped={photoTapped}
              toggleTaggedUsers={toggleTaggedUsers}
              handleLikeWithAnimation={handleLikeWithAnimation}
              handleLike={handleLike}
              handleOpenComments={handleOpenComments}
              lastTapRef={lastTapRef}
              handleDelete={handleDeletePost}
              handleEdit={handleEditPost}
            />
          );
        }}
      />
      {selectedReview && (
        <CommentModal
          visible={!!selectedReview}
          review={selectedReview}
          onClose={handleCloseComments}
          setSelectedReview={setSelectedReview}
          reviews={reviews}
          likedAnimations={likedAnimations}
          handleLikeWithAnimation={handleLikeWithAnimation}
          toggleTaggedUsers={toggleTaggedUsers}
          lastTapRef={lastTapRef}
          photoTapped={photoTapped}
        />
      )}
    </>

  )
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 5,
    backgroundColor: "#f5f5f5",
    marginTop: 130,
  },
  section: {
    padding: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  reviewCard: {
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 10,
    elevation: 2,
  },
  profilePic: {
    marginRight: 10,
  },
  business: {
    fontSize: 16,
    fontWeight: "bold",
    color: '#555',
  },
  date: {
    fontSize: 12,
    color: "#555",
    marginLeft: 10,
    marginTop: 10,
  },
  rating: {
    fontSize: 14,
    flexDirection: 'row',
  },
  review: {
    fontSize: 16,
    marginTop: 5,
  },
  buttonText: {
    color: 'white',
    flexDirection: 'row',
  },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    padding: 2,
  },
  userEmailText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  likeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  likeButtonText: {
    fontSize: 14,
    color: '#555',
    marginLeft: 5,
  },
  likeCount: {
    fontSize: 14,
    color: '#555',
    marginLeft: 5,
  },
  commentCard: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  commentText: {
    fontSize: 12,
    color: '#555',
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  commentInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingHorizontal: 10,
  },
  commentButton: {
    borderRadius: 5,
    marginLeft: 10,
    flexDirection: 'row',
  },
  commentButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  actionsContainer: {
    flexDirection: 'row',
    padding: 15,
  },
  commentCount: {
    marginLeft: 5,
  },
  userPicAndName: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    padding: 6,
  },
  userPic: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
  },
  pinIcon: {
    width: 50,
    height: 50,
    marginTop: 15,
    alignSelf: 'center'
  },
  smallPinIcon: {
    width: 20,
    height: 20,
    marginLeft: 5,
  },
  message: {
    marginBottom: 15,
    fontSize: 16,
  },
  businessCheckIn: {
    width: '100%',
    fontWeight: "bold",
    color: '#555',
  },
  tapArea: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  activeDot: {
    width: 10, // Slightly larger width
    height: 10, // Slightly larger height
    borderRadius: 5, // Ensure it's still circular
    backgroundColor: 'blue', // Highlighted color for active dot
  },
  inactiveDot: {
    backgroundColor: 'gray', // Default color for inactive dots
  },
});
