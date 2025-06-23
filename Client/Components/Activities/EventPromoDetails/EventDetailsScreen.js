import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import DetailsHeader from './DetailsHeader';
import CommentThread from '../../Reviews/CommentThread';
import CommentInputFooter from '../../Reviews/CommentINputFooter';
import { eventPromoLikeWithAnimation } from '../../../utils/LikeHandlers/promoEventLikes';
import dayjs from 'dayjs';

export default function EventDetailsScreen() {
    const { params } = useRoute();
    const { activity } = params;
    const { allEvents = [], allPromos = [], placeId, businessName } = activity;
    const [selectedType, setSelectedType] = useState(allEvents.length > 0 ? 'event' : 'promo');
    const [commentText, setCommentText] = useState('');
    const commentRefs = useRef({});

    const items = selectedType === 'event' ? allEvents : allPromos;
    const isPromo = selectedType === 'promo';

    return (
        <View style={styles.container}>
            <FlatList
                keyExtractor={(item, index) => `${activity?._id}-${index}`}
                ListHeaderComponent={
                    <DetailsHeader
                        activity={activity}
                        selectedType={selectedType}
                        getTimeSincePosted={(date) => dayjs(date).fromNow(true)}
                        handleLikeWithAnimation={eventPromoLikeWithAnimation}
                    />
                }
                renderItem={({ item }) => (
                    <View style={{ padding: 16 }}>
                        {/* Render Comments for this item */}
                        {item.comments?.map((comment) => (
                            <CommentThread
                                key={comment._id}
                                item={comment}
                                review={{
                                    _id: item._id,
                                    type: selectedType,
                                    placeId: placeId,
                                }}
                                commentRefs={commentRefs}
                                commentText={commentText}
                                setCommentText={setCommentText}
                            />
                        ))}
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },

});
