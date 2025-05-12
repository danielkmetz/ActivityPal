import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from "react-native";
import WriteReviewModal from "../Reviews/WriteReviewModal";
import {
    selectUserAndFriendsReviews,
    fetchReviewsByUserAndFriends,
    setUserAndFriendsReviews,
    appendUserAndFriendsReviews,
} from "../../Slices/ReviewsSlice";
import { selectUser } from "../../Slices/UserSlice";
import { 
    selectFollowing,
    fetchFollowRequests,
    fetchMutualFriends,
    fetchFollowersAndFollowing,
 } from "../../Slices/friendsSlice";
import { fetchFavorites } from "../../Slices/FavoritesSlice";
import { useSelector, useDispatch } from "react-redux";
import Reviews from "../Reviews/Reviews";
import usePaginatedFetch from '../../utils/usePaginatedFetch';
import InviteModal from "../ActivityInvites/InviteModal";

const Home = ({ scrollY, onScroll, isAtEnd }) => {
    const dispatch = useDispatch();
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const following = useSelector(selectFollowing);
    const user = useSelector(selectUser);
    const [business, setBusiness] = useState(null);
    const [businessName, setBusinessName] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [inviteVisible, setInviteVisible] = useState(false);
    const [modalType, setModalType] = useState("review"); // NEW

    const userId = user?.id;
    const {
        loadMore,
        refresh,
        isLoading,
        hasMore,
    } = usePaginatedFetch({
        fetchThunk: fetchReviewsByUserAndFriends,
        appendAction: appendUserAndFriendsReviews,
        resetAction: setUserAndFriendsReviews,
        params: { userId },
        limit: 5,
    });

    useEffect(() => {
        if (userId) {
            refresh();
            dispatch(fetchFavorites(userId));
        }
    }, [userId]);

    useEffect(() => {
        if (userId) {
            dispatch(fetchFollowRequests(userId));
            dispatch(fetchMutualFriends(userId));
            dispatch(fetchFollowersAndFollowing(userId));
        }
    }, [dispatch, userId]);

    return (
        <View style={styles.container}>
            <Reviews
                scrollY={scrollY}
                onScroll={onScroll}
                onLoadMore={loadMore}
                isLoadingMore={isLoading}
                hasMore={hasMore}
                reviews={userAndFriendsReviews}
                ListHeaderComponent={
                    <View style={styles.input}>
                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => {
                                    setModalType("review");
                                    setModalVisible(true);
                                }}
                            >
                                <Text style={styles.buttonText}>Review</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => {
                                    setModalType("check-in");
                                    setModalVisible(true);
                                }}
                            >
                                <Text style={styles.buttonText}>Check-In</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => setInviteVisible(true)}
                            >
                                <Text style={styles.buttonText}>Invite</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                }
            />

            {isAtEnd && <View style={styles.bottom} />}

            <WriteReviewModal
                visible={modalVisible}
                setReviewModalVisible={setModalVisible}
                onClose={() => setModalVisible(false)}
                business={business}
                setBusiness={setBusiness}
                businessName={businessName}
                setBusinessName={setBusinessName}
                initialTab={modalType}
            />

            <InviteModal 
                visible={inviteVisible}
                onClose={() => setInviteVisible(false)}
                friends={following}
                setShowInviteModal={setInviteVisible}
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
    input: {
        backgroundColor: '#009999',
        paddingTop: 205,
        paddingBottom: 15,
        alignItems: 'center',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '90%',
    },
    actionButton: {
        backgroundColor: '#d9d9d9',
        paddingVertical: 5,
        paddingHorizontal: 20,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.5,
        shadowRadius: 2,
        elevation: 3,
        marginHorizontal: 5,
    },
    buttonText: {
        fontSize: 15,
        color: '#333',
        fontWeight: 'bold'
    },
    bottom: {
        marginBottom: 30,
    },
});
