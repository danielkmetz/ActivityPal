import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useBusinessReviews } from '../../Providers/BusinessReviewsContext';
import Reviews from './Reviews';

function BusinessReviews({ scrollY, onScroll, isAtEnd }) {
  const { reviews, loadMore, isLoading, hasMore } = useBusinessReviews();

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
