import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Animated,
} from "react-native";
import { Avatar } from '@rneui/themed';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { toggleLike } from "../../Slices/ReviewsSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import CommentModal from "./CommentModal";
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { createNotification } from "../../Slices/NotificationsSlice";
import PhotoItem from "./PhotoItem";
import PhotoPaginationDots from "./PhotoPaginationDots";
import InviteCard from "./InviteCard";

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

  return (
    <>
      <AnimatedFlatList
        data={reviews}
        extraData={reviews}
        keyExtractor={(item, index) => (item._id || item.id || index).toString()}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: onScroll, // <-- your custom velocity logic from MainApp
          }
        )}
        scrollEventThrottle={16}
        renderItem={({ item }) => {
          if (item.type === 'invite') {
            return <InviteCard invite={item} handleLike={handleLike} handleOpenComments={handleOpenComments}/>;
          }
          
          return (
          <View style={styles.reviewCard}>
            <View style={styles.section}>
              <View style={styles.userPicAndName}>
                <View style={styles.profilePic}>
                  <Avatar
                    size={45}
                    rounded
                    source={item?.profilePicUrl ? { uri: item?.profilePicUrl } : profilePicPlaceholder} // Show image if avatarUrl exists
                    icon={!item?.avatarUrl ? { name: 'person', type: 'material', color: '#fff' } : null} // Show icon if no avatarUrl
                    containerStyle={{ backgroundColor: '#ccc' }} // Set background color for the generic avatar
                  />
                </View>

                {item?.taggedUsers?.length === 0 ? (
                  <Text style={styles.userEmailText}>{item.fullName}</Text>
                ) : (
                  <Text>
                    <Text style={styles.userEmailText}>{item.fullName}</Text>
                    {item.taggedUsers && item.taggedUsers?.length > 0 ? (
                      <>
                        {" "}is with{" "}
                        {item.taggedUsers.map((user, index) => (
                          <Text key={user._id || `tagged-user-${index}`} style={styles.userEmailText}>
                            {user.fullName}
                            {index < item.taggedUsers?.length - 1 ? ", " : ""}
                          </Text>
                        ))}
                        {item.type === "check-in" && (
                          <>
                            {" "}at{"\n"}
                            <Text style={styles.businessCheckIn} numberOfLines={null}>
                              {item.businessName}
                            </Text>
                          </>
                        )}
                        {item.type === "check-in" && item.photos?.length > 0 && (
                          <Image
                            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }} // A pin icon URL
                            style={styles.smallPinIcon}
                          />
                        )}
                      </>
                    ) : null}
                  </Text>
                )}
                {item.type === "check-in" && item.taggedUsers?.length === 0 && (
                  <>
                    <Text> is at </Text>
                    <Text style={styles.business} numberOfLines={0}>{item.businessName}</Text>
                    {item.photos?.length > 0 && (
                      <Image
                        source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }} // A pin icon URL
                        style={styles.smallPinIcon}
                      />
                    )}
                  </>
                )}
              </View>
              {item.type === 'check-in' && <Text style={styles.message}>{item.message || null}</Text>}
              {item.type == "review" && <Text style={styles.business}>{item.businessName}</Text>}
              {item.type === "check-in" && item.photos?.length === 0 && (
                <Image
                  source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }} // A pin icon URL
                  style={styles.pinIcon}
                />
              )}

              {/* Dynamically render stars */}
              {item.type === "review" && (
                <>
                  <View style={styles.rating}>
                    {Array.from({ length: item.rating }).map((_, index) => (
                      <MaterialCommunityIcons
                        key={index}
                        name="star"
                        size={20}
                        color="gold"
                      />
                    ))}
                  </View>
                  <Text style={styles.review}>{item.reviewText}</Text>
                </>
              )}
            </View>

            {/* ✅ Render Photos (If Available) */}
            {item.photos?.length > 0 && (
              <View>
                <FlatList
                  data={item.photos}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(photo, index) => index.toString()}
                  scrollEnabled={item.photos?.length > 1}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false } // Native driver is false since we animate layout properties
                  )}
                  scrollEventThrottle={16}
                  renderItem={({ item: photo }) => (
                    <PhotoItem
                      photo={photo}
                      reviewItem={item} // this is the full review item (probably a post or comment)
                      likedAnimations={likedAnimations}
                      photoTapped={photoTapped}
                      toggleTaggedUsers={toggleTaggedUsers}
                      handleLikeWithAnimation={handleLikeWithAnimation}
                      lastTapRef={lastTapRef}
                    />
                  )}
                />

                <PhotoPaginationDots photos={item.photos} scrollX={scrollX}/>
              </View>
            )}

            <Text style={styles.date}>
              Posted: {item.date ? new Date(item.date).toISOString().split("T")[0] : "Now"}
            </Text>
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                onPress={() => handleLike(item.type, item._id)}
                style={styles.likeButton}
              >
                <MaterialCommunityIcons name="thumb-up-outline" size={20} color="#808080" />
                <Text style={styles.likeCount}>{item?.likes?.length || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleOpenComments(item)}
                style={styles.commentButton}
              >
                <MaterialCommunityIcons name="comment-outline" size={20} color="#808080" />
                <Text style={styles.commentCount}>{item?.comments?.length || 0}</Text>
              </TouchableOpacity>
            </View>
          </View>
          )
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
