import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet } from "react-native";
import WriteReviewModal from "../Reviews/CreatePost";
import {
    selectUserAndFriendsReviews,
    fetchReviewsByUserAndFriends,
    setUserAndFriendsReviews,
    appendUserAndFriendsReviews,
    selectHasFetchedOnce,
    setHasFetchedOnce,
    setSuggestedPosts,
    selectSuggestedPosts,
} from "../../Slices/ReviewsSlice";
import { selectSuggestedUsers } from "../../Slices/friendsSlice";
import { selectUser } from "../../Slices/UserSlice";
import { fetchFollowRequests, fetchMutualFriends, fetchFollowersAndFollowing, selectFriends, } from "../../Slices/friendsSlice";
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
import { fetchConversations } from "../../Slices/DirectMessagingSlice";
import ChangeLocationModal from "../Location/ChangeLocationModal";
import { logEngagementIfNeeded } from "../../Slices/EngagementSlice";

const Home = ({ scrollY, onScroll, isAtEnd }) => {
    const dispatch = useDispatch();
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const friends = useSelector(selectFriends);
    const user = useSelector(selectUser);
    const suggestedFollows = useSelector(selectSuggestedUsers);
    const nearbySuggestions = useSelector(selectNearbySuggestions);
    const contentModal = useSelector(contentModalStatus);
    const inviteModal = useSelector(inviteModalStatus);
    const stories = useSelector(selectStories);
    const [business, setBusiness] = useState(null);
    const [businessName, setBusinessName] = useState(null);
    const [updatedFeed, setUpdatedFeed] = useState([]);
    const hasFetchedOnce = useSelector(selectHasFetchedOnce);
    const suggestedPosts = useSelector(selectSuggestedPosts);
    const seenToday = useRef(new Set());
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

    const viewabilityConfig = {
        itemVisiblePercentThreshold: 60, // only log if 60% of item is visible
    };

    const handleViewableItemsChanged = useRef(({ viewableItems }) => {
        viewableItems.forEach(item => {
            const data = item.item;
            const placeId = data?.placeId

            if (data?.type === 'suggestion') {
                let targetId = null;
                let targetType = null;

                const kind = data.kind?.toLowerCase() || '';

                if (kind.includes('event')) {
                    targetType = 'event';
                    targetId = data._id;
                } else if (kind.includes('promo')) {
                    targetType = 'promo';
                    targetId = data._id;
                } else {
                    targetType = 'place';
                    targetId = data.placeId;
                }

                const engagementKey = `${targetType}:${targetId}`;

                if (targetId && targetType && !seenToday.current.has(engagementKey)) {
                    console.log(`👁️ Logging view for ${engagementKey}`);
                    seenToday.current.add(engagementKey);

                    logEngagementIfNeeded(dispatch, {
                        targetType,
                        targetId,
                        placeId,
                        engagementType: 'view',
                    });
                } else {
                    console.log(`🔁 Skipped: already logged ${engagementKey}`);
                }
            }
        });
    }).current;

    useEffect(() => {
        if (userId) {
            refresh();
            dispatch(fetchFavorites(userId));
            dispatch(fetchStories(userId));
            dispatch(fetchFollowRequests(userId));
            dispatch(fetchMutualFriends(userId));
            dispatch(fetchFollowersAndFollowing(userId));
            dispatch(fetchInvites(userId));
            dispatch(fetchConversations());
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
                const suggestion = suggestions[suggestionIndex];
                result.push({
                    ...suggestion,
                    type: suggestion.type ?? 'suggestion', // only add 'suggestion' if not already set
                    __wrapped: true,
                });
                suggestionIndex++;
            }
        }

        while (suggestionIndex < suggestions.length) {
            const suggestion = suggestions[suggestionIndex];
            result.push({
                ...suggestion,
                type: suggestion.type ?? 'suggestion',
                __wrapped: true,
            });
            suggestionIndex++;
        }

        return result;
    }

    function flattenSuggestedFollows(suggestedFollows) {
        const posts = [];

        suggestedFollows.forEach(user => {
            (user.reviews || []).forEach(review => {
                posts.push({
                    ...review,
                    isSuggestedFollowPost: true,
                });
            });

            (user.checkIns || []).forEach(checkIn => {
                posts.push({
                    ...checkIn,
                    isSuggestedFollowPost: true,
                });
            });
        });

        return posts;
    };

    useEffect(() => {
        if (suggestedFollows.length > 0) {
            const followPosts = flattenSuggestedFollows(suggestedFollows);
            dispatch(setSuggestedPosts(followPosts));
        }
    }, [suggestedFollows]);

    useEffect(() => {
        const suggestionCards = nearbySuggestions.map(s => ({ ...s, type: 'suggestion' }));
        const allSuggestions = [...suggestionCards, ...suggestedPosts];
        const merged = injectSuggestions(userAndFriendsReviews, allSuggestions, 3);
        setUpdatedFeed(merged);
    }, [userAndFriendsReviews, nearbySuggestions, suggestedPosts]);

    return (
        <View style={styles.container}>
            <Reviews
                scrollY={scrollY}
                onScroll={onScroll}
                onLoadMore={loadMore}
                isLoadingMore={isLoading}
                hasMore={hasMore}
                onViewableItemsChanged={handleViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
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
            <ChangeLocationModal />
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
