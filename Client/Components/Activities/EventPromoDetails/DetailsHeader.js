import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg';
import PhotoItem from '../../Reviews/PhotoItem';
import PhotoPaginationDots from '../../Reviews/PhotoPaginationDots';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { selectLogo, fetchLogo } from '../../../Slices/PhotosSlice';
import { Avatar } from '@rneui/base';
import { getTimeLabel } from '../../../utils/formatEventPromoTime';
import PostActions from '../../Reviews/PostActions';

const DetailsHeader = ({ activity, getTimeSincePosted, handleLikeWithAnimation, lastTapRef }) => {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const logo = useSelector(selectLogo);
    const selectedType = ["activeEvent", "upcomingEvent"].includes(activity.kind) ? "event" : "promo";
    const { placeId, businessName } = activity || {};
    const isPromo = selectedType === 'promo'; // If you're using a toggle
    const scrollX = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (placeId) {
            dispatch(fetchLogo(placeId));
        }
    }, [placeId]);

    const goBack = () => {
        navigation.goBack();
    };

    const onOpenFullScreen = (photo, index) => {
        navigation.navigate('FullScreenPhoto', {
            reviewId: activity?._id,
            initialIndex: activity.photos.findIndex(p => p._id === photo._id),
            taggedUsersByPhotoKey: activity.taggedUsersByPhotoKey || {},
            isEventPromo: true,
        })
    }

    return (
        <View style={styles.header}>
            <View style={styles.headerText}>
                <View style={styles.userInfo}>
                    <View style={styles.headerBar}>
                        <TouchableOpacity onPress={goBack} style={styles.backButton}>
                            <MaterialCommunityIcons name="chevron-left" size={26} color="#000" />
                        </TouchableOpacity>
                    </View>
                    <Avatar
                        size={52}
                        rounded
                        source={logo ? { uri: logo } : profilePicPlaceholder}
                    />
                    <View style={{ flexDirection: 'column' }}>
                        <Text style={styles.businessName}>
                            {businessName}
                        </Text>
                        <Text style={styles.eventDate}>{getTimeSincePosted(activity?.date)} ago</Text>
                    </View>
                </View>
                <View style={styles.detailsSection}>
                    <Text style={styles.itemTitle}>{activity?.title}</Text>
                    <Text style={styles.time}>{getTimeLabel(activity)}</Text>
                    <Text style={styles.itemDescription}>{activity?.description}</Text>
                </View>
                {activity?.photos?.length > 0 && (
                    <View >
                        <FlatList
                            data={activity?.photos}
                            horizontal
                            pagingEnabled
                            bounces={false}
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={(item) => item?._id}
                            onScroll={Animated.event(
                                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                                { useNativeDriver: false }
                            )}
                            scrollEventThrottle={16}
                            // onTouchStart={() => {
                            //     setIsPhotoListActive(true);
                            // }}
                            // onTouchEnd={() => {
                            //     setIsPhotoListActive(false);
                            // }}
                            renderItem={({ item: photo }) => (
                                <PhotoItem
                                    photo={photo}
                                    reviewItem={activity}
                                    onOpenFullScreen={onOpenFullScreen}
                                    handleLikeWithAnimation={handleLikeWithAnimation}
                                    lastTapRef={lastTapRef}
                                />
                            )}
                        />
                        {activity.photos?.length > 1 && (
                            <PhotoPaginationDots photos={activity?.photos} scrollX={scrollX} />
                        )}
                    </View>
                )}
            </View>
            <View style={{ paddingLeft: 15 }}>
                <PostActions 
                    item={activity}
                    handleLikeWithAnimation={handleLikeWithAnimation}
                    isCommentScreen={true}
                />
            </View>
        </View>
    )
}

export default DetailsHeader;

const styles = StyleSheet.create({
    header: {
        flex: 1,
        marginTop: 45,
        backgroundColor: '#fff',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        justifyContent: 'center',
    },
    headerText: {
        //padding: 10,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    businessName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#222',
        marginLeft: 10,
    },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fff',
        zIndex: 1,
    },
    backButton: {
        padding: 5,
    },
    eventDate: {
        marginLeft: 10,
    },
    eventText: {
        fontSize: 15,
        color: '#333',
        marginBottom: 10,
    },
    detailsSection: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    itemTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 6,
    },
    itemDescription: {
        fontSize: 14,
        color: '#444',
        marginBottom: 10,
    },
    mediaImage: {
        width: '100%',
        height: 200,
        borderRadius: 8,
        marginBottom: 10,
    },
    navigationButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 10,
        paddingHorizontal: 16,
    },
    navButton: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#33cccc',
    },
    time: {
        fontSize: 14,
        color: '#d32f2f',
        fontWeight: '600',
        marginBottom: 10,
    },
})