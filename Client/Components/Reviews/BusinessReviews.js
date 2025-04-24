import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useSelector } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import usePaginatedFetch from '../../utils/usePaginatedFetch';
import {
  fetchReviewsByPlaceId,
  selectBusinessReviews,
  appendBusinessReviews,
  setBusinessReviews
} from '../../Slices/ReviewsSlice';
import Reviews from './Reviews';

function BusinessReviews({ scrollY, onScroll, isAtEnd }) {
  const user = useSelector(selectUser);
  const [shouldFetch, setShouldFetch] = useState(true);
  const reviews = useSelector(selectBusinessReviews)
  const placeId = user?.businessDetails?.placeId;

  const {
    loadMore,
    refresh,
    isLoading,
    hasMore,
  } = usePaginatedFetch({
    fetchThunk: fetchReviewsByPlaceId,
    appendAction: appendBusinessReviews,
    resetAction: setBusinessReviews,
    params: { placeId },
    limit: 5,
  });


  useEffect(() => {
    if (placeId && shouldFetch) {
      refresh();
      setShouldFetch(false);
    }
  }, [placeId]);

  return (
    <View style={styles.container}>
      <Reviews
        reviews={reviews}
        onLoadMore={loadMore}
        isLoadingMore={isLoading}
        hasMore={hasMore}
        scrollY={scrollY}
        onScroll={onScroll}
        isAtEnd={isAtEnd}
        ListHeaderComponent={
          <View style={styles.buffer} />
        }
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
    marginTop: -100,
  },
  buffer: {
    backgroundColor: '#009999',
    paddingTop: 220,
    justifyContent: 'start'
  },
});
