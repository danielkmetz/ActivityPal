import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { toggleLike } from "../../Slices/ReviewsSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import CommentModal from "./CommentModal";
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { createNotification } from "../../Slices/NotificationsSlice";

const screenWidth = Dimensions.get("window").width;

export default function Reviews({reviews}) {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const [selectedReview, setSelectedReview] = useState(null); // For the modal

    const userId = user?.id
    const fullName = `${user?.firstName} ${user?.lastName}`;

    const handleOpenComments = (review) => {
        setSelectedReview(review);
    };

    const handleCloseComments = () => {
        setSelectedReview(null);
    };

    const handleLike = async (reviewId) => {
          // Find the review to update
          const reviewToUpdate = reviews.find((review) => review._id === reviewId);
      
          if (!reviewToUpdate) {
              console.error(`Review with ID ${reviewId} not found.`);
              return;
          }
      
          const placeId = reviewToUpdate.placeId;
      
          try {
              // Sync with the backend
              const { payload } = await dispatch(toggleLike({ placeId, reviewId, userId, fullName }));

              // Check if the current user's ID exists in the likes array before sending a notification
              const userLiked = payload.likes.some(like => like.userId === userId);

              // Create a notification for the review owner
              if (userLiked && reviewToUpdate.userId !== userId) { // Don't notify self-likes
                await dispatch(createNotification({
                    userId: reviewToUpdate.userId,
                    type: 'like',
                    message: `${fullName} liked your review.`,
                    relatedId: userId,
                    typeRef: 'Review',
                    targetId: reviewId,
                }));
              }
          } catch (error) {
              console.error('Error toggling like:', error);
          }
    };

    return (
        <>
        <FlatList
            data={reviews}
            keyExtractor={(item) => item._id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
                <View style={styles.reviewCard}>
                    <View style={styles.section}>
                      <View style={styles.userPicAndName}>
                        <Image source={item.profilePicUrl ? { uri: item.profilePicUrl } : profilePicPlaceholder} style={styles.userPic} />
                        <Text style={styles.userEmailText}>{item.fullName}</Text>
                      </View>
                      <Text style={styles.business}>{item.businessName}</Text>
                            
                      {/* Dynamically render stars */}
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
                      <Text style={styles.date}>
                          Posted: {item.date ? new Date(item.date).toISOString().split("T")[0] : "Now"}
                      </Text>
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
                                renderItem={({ item: photo }) => (
                                    <Image source={{ uri: photo.url }} style={styles.photo} />
                                )}
                            />
                            {/* Dots Indicator */}
                            <View style={styles.paginationContainer}>
                                {item.photos.map((_, index) => (
                                    <View key={index} style={styles.dot} />
                                ))}
                            </View>
                        </View>
                    )}
                    <View style={styles.actionsContainer}>
                        <TouchableOpacity
                            onPress={() => handleLike(item._id)}
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
            )}
        />
        {selectedReview && (
            <CommentModal
                visible={!!selectedReview}
                review={selectedReview}
                onClose={handleCloseComments}
                setSelectedReview={setSelectedReview}
                reviews={reviews}
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
      padding: 15,
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
    business: {
      fontSize: 16,
      fontWeight: "bold",
      color: '#555',
    },
    date: {
      fontSize: 12,
      color: "#555",
      marginTop: 10,
    },
    rating: {
      fontSize: 14,
      flexDirection: 'row',
  
    },
    review: {
      fontSize: 14,
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
    },
    userPic: {
      width: 30,
      height: 30,
      borderRadius: 15,
      marginRight: 10,
    },
    photo: {
      width: screenWidth , // Full width of review minus padding
      height: 400, // Larger photo height
      borderRadius: 8,
    },
    paginationContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 5,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ccc',
        marginHorizontal: 5,
    },
  
});
  