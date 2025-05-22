import React, { useEffect, useState } from "react";
import {
    View,
    StyleSheet,
} from "react-native";
import WriteReviewModal from "../Reviews/CreatePost";
import {
    selectUserAndFriendsReviews,
    fetchReviewsByUserAndFriends,
    setUserAndFriendsReviews,
    appendUserAndFriendsReviews,
} from "../../Slices/ReviewsSlice";
import { selectUser } from "../../Slices/UserSlice";
import {
    fetchFollowRequests,
    fetchMutualFriends,
    fetchFollowersAndFollowing,
    selectFriends,
} from "../../Slices/friendsSlice";
import { fetchFavorites } from "../../Slices/FavoritesSlice";
import { useSelector, useDispatch } from "react-redux";
import Reviews from "../Reviews/Reviews";
import usePaginatedFetch from '../../utils/usePaginatedFetch';
import InviteModal from "../ActivityInvites/InviteModal";
import { selectStories, fetchStories } from "../../Slices/StoriesSlice";
import Stories from "../Stories/Stories";
import {
    closeContentModal,
    closeInviteModal,
    contentModalStatus,
    inviteModalStatus,
} from "../../Slices/ModalSlice";

const Home = ({ scrollY, onScroll, isAtEnd }) => {
    const dispatch = useDispatch();
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const friends = useSelector(selectFriends);
    const user = useSelector(selectUser);
    const contentModal = useSelector(contentModalStatus);
    const inviteModal = useSelector(inviteModalStatus);
    const stories = useSelector(selectStories);
    const [business, setBusiness] = useState(null);
    const [businessName, setBusinessName] = useState(null);

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
            dispatch(fetchStories(userId));
        }
    }, [userId]);

    useEffect(() => {
        if (userId) {
            dispatch(fetchFollowRequests(userId));
            dispatch(fetchMutualFriends(userId));
            dispatch(fetchFollowersAndFollowing(userId));
        }
    }, [userId]);
    
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
                    <View style={styles.storiesWrapper}>
                        <Stories stories={stories} />
                    </View>
                }
            />
            {isAtEnd && <View style={styles.bottom} />}

            <WriteReviewModal
                visible={contentModal}
                onClose={() => dispatch(closeContentModal())}
                business={business}
                setBusiness={setBusiness}
                businessName={businessName}
                setBusinessName={setBusinessName}
            />
            <InviteModal
                visible={inviteModal}
                onClose={() => dispatch(closeInviteModal())}
                friends={friends}
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
        paddingVertical: 10,
        alignItems: 'center',
    },
    storiesWrapper: {
        backgroundColor: '#008080',
        paddingTop: 190,
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
