import React, { useState, useRef, useEffect, Fragment, useMemo } from "react";
import {
    View,
    Text,
    StyleSheet,
    Animated,
    TouchableWithoutFeedback,
    TouchableOpacity,
} from "react-native";
import PostActions from "./PostActions/PostActions";
import PostOptionsMenu from "./PostOptionsMenu";
import ExpandableText from "./ExpandableText";
import { selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import { handleFollowUserHelper } from "../../utils/followHelper";
import { createNotification } from "../../Slices/NotificationsSlice";
import RatingsBreakdownModal from "./metricRatings/RatingsBreakdownModal";
import { declineFollowRequest, cancelFollowRequest, approveFollowRequest } from "../../Slices/friendsSlice";
import { logEngagementIfNeeded } from "../../Slices/EngagementSlice";
import PhotoFeed from "./Photos/PhotoFeed";
import RatingsButton from './ReviewItem/RatingsButton';
import FollowButton from './PostActions/FollowButton';
import PostHeader from './PostHeader/PostHeader';
import NonOwnerOptions from './PostOptionsMenu/NonOwnerPostOptions';
import { navigateToOtherUserProfile, handleFollowUser } from '../../utils/userActions';

const MaybeTWF = ({ enabled, onPress, children }) =>
    enabled ? (
        <TouchableWithoutFeedback onPress={onPress}>{children}</TouchableWithoutFeedback>
    ) : (
        <Fragment>{children}</Fragment>
    );

export default function ReviewItem({
    item,
    photoTapped,
    setPhotoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    handleOpenComments,
    lastTapRef,
    handleEdit,
    handleDelete,
    following,
    followRequests,
    onShare,
    sharedPost,
}) {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const user = useSelector(selectUser);
    const isSender = item.userId === user?.id;
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const currentIndexRef = useRef(0);
    const [isFollowing, setIsFollowing] = useState(false);
    const [ratingsOpen, setRatingsOpen] = useState(false);
    const [isRequestSent, setIsRequestSent] = useState(false);
    const [isRequestReceived, setIsRequestReceived] = useState(false);
    const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);
    const scrollX = useRef(new Animated.Value(0)).current;
    const currentPhoto = item.photos?.[currentPhotoIndex];
    const { isSuggestedFollowPost } = item;
    const isPrivate = item?.profileVisibility === 'private';
    const fullName = `${user.firstName} ${user.lastName}`;
    const postPhotos = item?.photos;
    const placeId = item?.placeId;
    const postOwnerId = item?.userId;

    const taggedUsersByPhotoKey = Object.fromEntries(
        (postPhotos || []).map((photo) => [
            photo.photoKey,
            photo.taggedUsers || [],
        ])
    );

    const followingIdSet = useMemo(
        () => new Set((following || []).map(u => String(u?._id ?? u?.id ?? u))),
        [following]
    );

    const navigateToBusiness = () => {
        logEngagementIfNeeded(dispatch, {
            targetType: 'place',
            targetId: placeId,
            placeId,
            engagementType: 'click',
        })
        navigation.navigate("BusinessProfile", { business: item });
    };

    const handleOpenFullScreen = (photo, index) => {
        navigation.navigate('FullScreenPhoto', {
            reviewId: item._id,
            initialIndex: index,
            lastTapRef,
            taggedUsersByPhotoKey: taggedUsersByPhotoKey || {}, // or however you pass it
            isSuggestedPost: isSuggestedFollowPost,
        });
    };

    const onViewProfile = (targetId) =>
        navigateToOtherUserProfile({
            navigation,
            userId: targetId,
            currentUserId: user?.id,

        });

    const onFollow = () =>
        handleFollowUser({
            isPrivate,                // boolean
            userId: postOwnerId,      // target
            mainUser: user,           // current user object from Redux
            dispatch,
            setIsFollowing,           // state setter from component
            setIsRequestSent,         // state setter from component
        });

    const handleAcceptRequest = async () => {
        await dispatch(approveFollowRequest(postOwnerId));

        // ✅ Create a notification for the original sender
        await dispatch(createNotification({
            userId: postOwnerId,
            type: 'followAccepted',
            message: `${fullName} accepted your follow request!`,
            relatedId: postOwnerId,
            typeRef: 'User'
        }));
    };

    const handleDenyRequest = () => dispatch(declineFollowRequest({ requesterId: postOwnerId }));

    const handleCancelRequest = async () => {
        await dispatch(cancelFollowRequest({ recipientId: postOwnerId }));
        // ✅ Explicitly update the state to ensure UI reflects the change
        setIsRequestSent(false);
    };

    useEffect(() => {
        if (!user || !followRequests || !following) return;

        const followingIds = following.map(u => u._id);
        const sentRequestIds = (followRequests?.sent || []).map(u => u._id || u);
        const receivedRequestIds = (followRequests?.received || []).map(u => u._id || u);

        setIsRequestSent(sentRequestIds.includes(postOwnerId));
        setIsRequestReceived(receivedRequestIds.includes(postOwnerId));
        setIsFollowing(followingIds.includes(postOwnerId));
    }, [user, following, followRequests]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (currentPhotoIndex !== currentIndexRef.current) {
                setCurrentPhotoIndex(currentIndexRef.current);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [currentPhotoIndex]);

    const card = (
        <View style={styles.reviewCard}>
            {!sharedPost && (
                <PostOptionsMenu
                    isSender={isSender}
                    dropdownVisible={dropdownVisible}
                    setDropdownVisible={setDropdownVisible}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                    postData={item}
                />
            )}
            {!isSender && !sharedPost && (
                <TouchableOpacity
                    onPress={() => setViewerOptionsVisible(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ position: 'absolute', top: 6, right: 6, padding: 6, zIndex: 5 }}
                >
                    <Text style={{ fontSize: 22, lineHeight: 22 }}>⋯</Text>
                </TouchableOpacity>
            )}
            <View style={styles.section}>
                <PostHeader
                    item={item}
                    onPressUser={onViewProfile}
                    // Reviews: business shown on its own line below, so keep both false
                    includeAtWithBusiness={false}
                    showAtWhenNoTags={false}
                    isSuggestedFollowPost={isSuggestedFollowPost}
                    rightComponent={
                        <FollowButton
                            isSuggestedFollowPost={isSuggestedFollowPost}
                            isFollowing={isFollowing}
                            isRequestReceived={isRequestReceived}
                            isRequestSent={isRequestSent}
                            onAcceptRequest={handleAcceptRequest}
                            onDenyRequest={handleDenyRequest}
                            onCancelRequest={handleCancelRequest}
                            onFollow={onFollow}
                            onPressFollowing={() => onViewProfile(postOwnerId)}
                        />
                    }
                />
                <TouchableOpacity
                    onPress={navigateToBusiness}
                    style={styles.businessLink}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                    <Text style={styles.business}>{item.businessName}</Text>
                </TouchableOpacity>
                <RatingsButton
                    rating={item.rating}
                    ratings={{
                        rating: item.rating,
                        priceRating: item.priceRating,
                        serviceRating: item.serviceRating,
                        atmosphereRating: item.atmosphereRating,
                        wouldRecommend: item.wouldRecommend,
                    }}
                />
                <ExpandableText
                    text={item.reviewText}
                    maxLines={4}
                    textStyle={styles.review}
                />
            </View>
            {/* ✅ Photos */}
            {postPhotos?.length > 0 && (
                <PhotoFeed
                    media={postPhotos}
                    scrollX={scrollX}
                    currentIndexRef={currentIndexRef}
                    reviewItem={item}
                    photoTapped={photoTapped}
                    handleLikeWithAnimation={handleLikeWithAnimation}
                    lastTapRef={lastTapRef}
                    onOpenFullScreen={handleOpenFullScreen}
                    setCurrentPhotoIndex={setCurrentPhotoIndex}
                />
            )}
            <Text style={styles.date}>
                Posted: {item.date ? new Date(item.date).toISOString().split("T")[0] : "Now"}
            </Text>
            {!sharedPost && (
                <View style={{ padding: 15 }}>
                    <PostActions
                        item={item}
                        setPhotoTapped={setPhotoTapped}
                        handleLikeWithAnimation={handleLikeWithAnimation}
                        handleOpenComments={handleOpenComments}
                        toggleTaggedUsers={toggleTaggedUsers}
                        photo={currentPhoto}
                        onShare={onShare}
                        onRequestShowTags={(photoKey) => toggleTaggedUsers?.(photoKey)}   // or a deterministic show fn
                        onFollowUser={(targetUserId) => handleFollowUser({
                            isPrivate,
                            userId: targetUserId,
                            mainUser: user,
                            dispatch,
                            setIsFollowing,
                            setIsRequestSent,
                        })}
                        onNavigateToProfile={(targetUserId) => onViewProfile(targetUserId)}
                        getIsFollowing={(uid) => followingIdSet.has(String(uid))}
                    />
                </View>
            )}
        </View>
    )

    return (
        <View>
            <MaybeTWF enabled={!!sharedPost} onPress={() => handleOpenComments(item)}>
                {card}
            </MaybeTWF>
            <RatingsBreakdownModal
                visible={ratingsOpen}
                onClose={() => setRatingsOpen(false)}
                ratings={{
                    rating: item.rating,
                    priceRating: item.priceRating,
                    serviceRating: item.serviceRating,
                    atmosphereRating: item.atmosphereRating,
                    wouldRecommend: item.wouldRecommend,
                }}
            />
            <NonOwnerOptions
                visible={viewerOptionsVisible}
                item={item}
                onClose={() => setViewerOptionsVisible(false)}
                isFollowing={!!isFollowing}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    reviewCard: {
        backgroundColor: "#fff",
        borderRadius: 5,
        marginBottom: 10,
        elevation: 2,
    },
    section: {
        padding: 10,
        flexShrink: 1,
    },
    business: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#555",
    },
    review: {
        fontSize: 16,
        marginTop: 5,
    },
    date: {
        fontSize: 12,
        color: "#555",
        marginLeft: 10,
        marginTop: 10,
    },
    businessLink: {
        alignSelf: 'flex-start', // <-- prevents full-width stretch
    },
});
