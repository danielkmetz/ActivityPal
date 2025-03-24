import React, { useEffect } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import { fetchReviewsByPlaceId, selectBusinessReviews } from '../../Slices/ReviewsSlice';
import Reviews from './Reviews';

function BusinessReviews() {
    const user = useSelector(selectUser);
    const dispatch = useDispatch();
    const reviews = useSelector(selectBusinessReviews)
    const placeId = user?.businessDetails?.placeId;
    
    useEffect(() => {
        if (placeId) {
            dispatch(fetchReviewsByPlaceId(placeId))
        }
    }, [placeId])
    
    return (
        <View style={styles.container}>
            <FlatList
                style={styles.list}
                data={reviews}
                keyExtractor={(item, index) => index.toString()}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => <Reviews reviews={[item]} />}
            />
        </View>
    );
}

export default BusinessReviews;

// Add styles here
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        marginTop: 130,
    },
    list: {
        flexGrow: 1,
    },
    
});
