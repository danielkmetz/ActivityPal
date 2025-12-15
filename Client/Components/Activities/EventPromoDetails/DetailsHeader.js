import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Avatar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { selectLogo, fetchLogo } from '../../../Slices/PhotosSlice';
import { getTimeLabel } from '../../../utils/formatEventPromoTime';
import PostActions from '../../Reviews/PostActions/PostActions';
import { resetSelectedEvent } from '../../../Slices/EventsSlice';
import { resetSelectedPromotion } from '../../../Slices/PromotionsSlice';
import { logEngagementIfNeeded } from '../../../Slices/EngagementSlice';
import InviteActionButton from '../../Reviews/Invites/InviteActionButton';
import PhotoFeed from '../../Reviews/Photos/PhotoFeed';

const DetailsHeader = ({ activity, getTimeSincePosted }) => {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const logo = useSelector(selectLogo);
    const [cachedLogo, setCachedLogo] = useState(null);
    const selectedType = activity?.kind?.toLowerCase().includes('event') ? 'event' : 'promo'
    const { placeId, businessName } = activity || {};
    const currentIndexRef = useRef(0);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (placeId && !logo) {
            dispatch(fetchLogo(placeId));
        }
    }, [placeId, logo]);

    useEffect(() => {
        if (logo) {
            setCachedLogo(logo);
        }
    }, [logo]);

    const goBack = () => {
        navigation.goBack();
        if (selectedType === 'event') {
            dispatch(resetSelectedEvent());
        } else {
            dispatch(resetSelectedPromotion());
        }
    };

    const navigateToBusiness = () => {
        const targetType = 'place';

        logEngagementIfNeeded(dispatch, {
            targetType,
            targetId: placeId,
            placeId,
            engagementType: 'click',
        });
        navigation.navigate("BusinessProfile", { business: activity });
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
                    <Avatar.Image
                        size={52}
                        rounded
                        source={cachedLogo ? { uri: cachedLogo } : profilePicPlaceholder}
                    />
                    <View style={{ flexDirection: 'column' }}>
                        <TouchableOpacity onPress={navigateToBusiness} >
                            <Text style={styles.businessName}>
                                {businessName}
                            </Text>
                        </TouchableOpacity>
                        <Text style={styles.eventDate}>{getTimeSincePosted(activity?.date)} ago</Text>
                    </View>
                </View>
                <View style={styles.detailsSection}>
                    <View style={styles.titleRow}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={styles.itemTitle}>{activity?.title}</Text>
                            <Text style={styles.time}>{getTimeLabel(activity)}</Text>
                        </View>
                        <InviteActionButton
                            suggestion={activity}
                            existingInvite={null} // upgrade later to detect + pass existing invite
                        />
                    </View>
                    <Text style={styles.itemDescription}>{activity?.description}</Text>
                </View>
                <PhotoFeed
                    post={activity}
                    scrollX={scrollX}
                    currentIndexRef={currentIndexRef}
                    setCurrentPhotoIndex={setCurrentPhotoIndex}
                    photoTapped={null}
                    isCommentScreen={true}
                />
            </View>
            <View style={{ paddingLeft: 15 }}>
                <PostActions
                    post={activity}
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
    titleRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
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