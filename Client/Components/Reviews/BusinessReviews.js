import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import { toggleLike, selectLocalReviews, setLocalReviews } from '../../Slices/ReviewsSlice';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CommentModal from './CommentModal';

function BusinessReviews() {
    const user = useSelector(selectUser);
    const dispatch = useDispatch();
    const reviews = user?.businessDetails?.reviews || [];
    const businessName = user?.businessDetails?.businessName;
    const placeId = user?.businessDetails?.placeId;
    const userId = user?.id;
    const fullName = `${user?.firstName} ${user?.lastName}`;
    const localReviews = useSelector(selectLocalReviews);
    const [selectedReview, setSelectedReview] = useState(null); // For the modal
    
    useEffect(() => {
        dispatch(setLocalReviews(reviews));
    }, [reviews])

    const handleLike = async (reviewId) => {
        const updatedReviews = localReviews.map((review) => {
            if (review._id === reviewId) {
                const userIndex = review.likes.findIndex((like) => like.userId === userId);
                if (userIndex > -1) {
                    return {
                        ...review,
                        likes: review.likes.filter((like) => like.userId !== userId),
                    };
                } else {
                    return {
                        ...review,
                        likes: [...review.likes, { userId, fullName }],
                    };
                }
            }
            return review;
        });

        dispatch(setLocalReviews(updatedReviews));

        try {
            await dispatch(toggleLike({ placeId, reviewId, userId, fullName }));
        } catch (error) {
            console.error('Error toggling like:', error);
            dispatch(setLocalReviews(reviews));
        }
    };

    const handleOpenComments = (review) => {
        setSelectedReview(review);
    };

    const handleCloseComments = () => {
        setSelectedReview(null);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{businessName} Reviews:</Text>
            <FlatList
                data={localReviews}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                    <View style={styles.reviewCard}>
                        <Text style={styles.ratingText}>{'⭐'.repeat(item.rating)}</Text>
                        <Text style={styles.reviewText}>{item.reviewText}</Text>
                        <Text style={styles.dateText}>Posted: {item.date.split("T")[0]}</Text>
                        <Text style={styles.userEmailText}>By: {item.fullName}</Text>
                        <View style={styles.actionsContainer}>
                            <TouchableOpacity
                                onPress={() => handleLike(item._id)}
                                style={styles.likeButton}
                            >
                                <MaterialCommunityIcons name="thumb-up-outline" size={20} color="#808080" />
                                <Text style={styles.likeCount}>{item.likes.length || 0}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleOpenComments(item)}
                                style={styles.commentButton}
                            >
                                <MaterialCommunityIcons name="comment-outline" size={20} color="#808080" />
                                <Text style={styles.commentCount}>{item.comments.length || 0}</Text>
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
                />
            )}
        </View>
    );
}

export default BusinessReviews;

// Add styles here
const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#f5f5f5',
        marginTop: 150,
    },
    noReviewsText: {
        textAlign: 'center',
        fontSize: 16,
        color: '#555',
        marginTop: 20,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    reviewCard: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 5,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
    },
    ratingText: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    reviewText: {
        fontSize: 14,
        color: '#333',
        marginBottom: 5,
    },
    dateText: {
        fontSize: 12,
        color: '#777',
        marginBottom: 5,
    },
    userEmailText: {
        fontSize: 12,
        color: '#555',
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
        marginTop: 10,
    },
    commentCount: {
        marginLeft: 5,
    }
});
