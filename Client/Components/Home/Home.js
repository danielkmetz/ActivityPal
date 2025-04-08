import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList
} from "react-native";
import WriteReviewModal from "../Reviews/WriteReviewModal";
import {
    selectUserAndFriendsReviews,
    fetchReviewsByUserAndFriends
} from "../../Slices/ReviewsSlice";
import { fetchFriendRequestsDetails, fetchFriendsDetails, selectFriends, selectFriendRequests } from "../../Slices/UserSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import { fetchFavorites } from "../../Slices/FavoritesSlice";
import Reviews from "../Reviews/Reviews";

const Home = ({scrollY, onScroll, isAtEnd}) => {
    const dispatch = useDispatch();
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const friends = useSelector(selectFriends);
    const friendRequests = useSelector(selectFriendRequests);
    const user = useSelector(selectUser);
    const [business, setBusiness] = useState(null);
    const [businessName, setBusinessName] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);

    const handleEndReached = () => {
        setIsAtEnd(true);
    };

    const userId = user?.id;

    useEffect(() => {
        if (user) {
            dispatch(fetchReviewsByUserAndFriends(userId));
            dispatch(fetchFavorites(userId));
        }
    }, [dispatch, user]);

    useEffect(() => {
        if (friends?.length > 0) {
            dispatch(fetchFriendsDetails(friends)); // Populate friends with user details
        }
    }, [dispatch, friends]);

    useEffect(() => {
        if (friendRequests) {
            dispatch(fetchFriendRequestsDetails(friendRequests?.received));
        }
    }, [dispatch, friendRequests])

    const openModal = () => {
        setModalVisible(true)
    };

    const closeModal = () => {
        setModalVisible(false);
    };
    
    return (
        <View style={styles.container}>
            <Reviews
                scrollY={scrollY}
                onScroll={onScroll} 
                reviews={userAndFriendsReviews} 
                ListHeaderComponent={
                    <View style={styles.input}>
                      <TouchableOpacity style={styles.statusInputContainer} onPress={openModal}>
                        <Text style={styles.inputPlaceholder}>Write a review or check in!</Text>
                      </TouchableOpacity>
                    </View>
                }    
            />

            {isAtEnd && <View style={styles.bottom} />}

            {/* Write Review Modal */}
            <WriteReviewModal
                visible={modalVisible}
                setReviewModalVisible={setModalVisible}
                onClose={closeModal}
                business={business}
                setBusiness={setBusiness}
                businessName={businessName}
                setBusinessName={setBusinessName}
            />
        </View>
    );
};

export default Home;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f5f5f5",
        marginTop: -70,
    },
    list: {
        flexGrow: 1,
    },
    input: {
        backgroundColor: '#009999',
        paddingTop: 205,
        justifyContent: 'start'
    },
    statusInputContainer: {
        backgroundColor: 'white',
        paddingVertical: 6,
        paddingHorizontal: 15,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
        marginBottom: 10,
        marginHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'flex-start',
        alignSelf: 'flex-start',
        width: '90%',
    },
    inputPlaceholder: {
        fontSize: 16,
        color: 'gray',
    },
    bottom: {
        marginBottom: 30,
    }
});
