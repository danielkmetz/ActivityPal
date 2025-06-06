import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import WriteReviewModal from "../Reviews/CreatePost";
import {
    selectUserAndFriendsReviews,
    fetchReviewsByUserAndFriends,
    setUserAndFriendsReviews,
    appendUserAndFriendsReviews,
    selectHasFetchedOnce,
    setHasFetchedOnce,
} from "../../Slices/ReviewsSlice";
import { selectUser } from "../../Slices/UserSlice";
import { fetchFollowRequests, fetchMutualFriends, fetchFollowersAndFollowing, selectFriends } from "../../Slices/friendsSlice";
import { fetchFavorites } from "../../Slices/FavoritesSlice";
import { useSelector, useDispatch } from "react-redux";
import Reviews from "../Reviews/Reviews";
import usePaginatedFetch from '../../utils/usePaginatedFetch';
import InviteModal from "../ActivityInvites/InviteModal";
import { selectStories, fetchStories } from "../../Slices/StoriesSlice";
import Stories from "../Stories/Stories";
import { closeContentModal, closeInviteModal, contentModalStatus, inviteModalStatus } from "../../Slices/ModalSlice";
import { selectNearbySuggestions } from "../../Slices/GooglePlacesSlice";
import { fetchInvites } from "../../Slices/InvitesSlice";

const Home = ({ scrollY, onScroll, isAtEnd }) => {
    const dispatch = useDispatch();
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const friends = useSelector(selectFriends);
    const user = useSelector(selectUser);
    const nearbySuggestions = useSelector(selectNearbySuggestions);
    const contentModal = useSelector(contentModalStatus);
    const inviteModal = useSelector(inviteModalStatus);
    const stories = useSelector(selectStories);
    const [business, setBusiness] = useState(null);
    const [businessName, setBusinessName] = useState(null);
    const [updatedFeed, setUpdatedFeed] = useState([]);
    const hasFetchedOnce = useSelector(selectHasFetchedOnce);
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
        if (userId && !hasFetchedOnce) {
            refresh();
            dispatch(fetchFavorites(userId));
            dispatch(fetchStories(userId));
            dispatch(fetchFollowRequests(userId));
            dispatch(fetchMutualFriends(userId));
            dispatch(fetchFollowersAndFollowing(userId));
            dispatch(fetchInvites(userId));
            dispatch(setHasFetchedOnce(true));
        }
    }, [userId]);

    function injectSuggestions(reviews, suggestions, interval = 3) {
        const result = [];
        let reviewCount = 0;
        let suggestionIndex = 0;

        for (let i = 0; i < reviews.length; i++) {
            result.push({ ...reviews[i], __wrapped: false });
            reviewCount++;

            if (reviewCount % interval === 0 && suggestionIndex < suggestions.length) {
                result.push({
                    ...suggestions[suggestionIndex],
                    type: 'suggestion',
                    __wrapped: true,
                });
                suggestionIndex++;
            }
        }

        while (suggestionIndex < suggestions.length) {
            result.push({
                ...suggestions[suggestionIndex],
                type: 'suggestion',
                __wrapped: true,
            });
            suggestionIndex++;
        }

        return result;
    }

    useEffect(() => {
        const merged = injectSuggestions(userAndFriendsReviews, nearbySuggestions, 1);
        setUpdatedFeed(merged);
    }, [userAndFriendsReviews, nearbySuggestions]);

    return (
        <View style={styles.container}>
            <Reviews
                scrollY={scrollY}
                onScroll={onScroll}
                onLoadMore={loadMore}
                isLoadingMore={isLoading}
                hasMore={hasMore}
                reviews={updatedFeed}
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
