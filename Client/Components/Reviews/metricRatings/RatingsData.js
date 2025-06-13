import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const MAX_PRICE_RATING = 4;
const MAX_RATING = 5;

const RatingsData = ({ ratingData }) => {
  if (!ratingData) return null;

  const {
    averageRating = null,
    averagePriceRating = null,
    averageServiceRating = null,
    averageAtmosphereRating = null,
    recommendPercentage = null,
  } = ratingData;

  const renderStars = (rating) => {
    if (rating == null) return 'N/A';

    const full = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.25 && rating % 1 < 0.75;
    const empty = MAX_RATING - full - (hasHalf ? 1 : 0);

    return (
      <View style={styles.inline}>
        {[...Array(full)].map((_, i) => (
          <MaterialCommunityIcons key={`full-${i}`} name="star" size={18} color="gold" />
        ))}
        {hasHalf && <MaterialCommunityIcons name="star-half-full" size={18} color="gold" />}
        {[...Array(empty)].map((_, i) => (
          <MaterialCommunityIcons key={`empty-${i}`} name="star-outline" size={18} color="#ccc" />
        ))}
      </View>
    );
  };

  const renderPriceRating = () => {
    if (averagePriceRating == null) return 'N/A';

    const fullDollars = Math.floor(averagePriceRating);
    const hasPartial = averagePriceRating % 1 !== 0;
    const emptyDollars = MAX_PRICE_RATING - fullDollars - (hasPartial ? 1 : 0);

    return (
      <View style={styles.inline}>
        {[...Array(fullDollars)].map((_, i) => (
          <Text key={`full-${i}`} style={styles.fullDollar}>$</Text>
        ))}
        {hasPartial && <Text style={styles.partialDollar}>$</Text>}
        {[...Array(emptyDollars)].map((_, i) => (
          <Text key={`empty-${i}`} style={styles.emptyDollar}>$</Text>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>⭐ Overall:</Text>
        <Text style={styles.value}>
          {renderStars(averageRating)}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>💰 Price:</Text>
        {renderPriceRating()}
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>🧑‍🍳 Service:</Text>
        <Text style={styles.value}>
          {averageServiceRating != null ? averageServiceRating.toFixed(1) : 'N/A'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>✨ Atmosphere:</Text>
        <Text style={styles.value}>
          {averageAtmosphereRating != null ? averageAtmosphereRating.toFixed(1) : 'N/A'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>👍 Recommend:</Text>
        <Text style={styles.value}>
          {recommendPercentage != null ? `${recommendPercentage}%` : 'N/A'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 5,
    //padding: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontWeight: 'bold',
    minWidth: 100,
  },
  value: {
    fontSize: 15,
  },
  inline: {
    flexDirection: 'row',
  },
  fullDollar: {
    color: '#000',
    fontSize: 16,
  },
  partialDollar: {
    color: '#888',
    fontSize: 16,
  },
  emptyDollar: {
    color: '#ccc',
    fontSize: 16,
  },
});

export default RatingsData;
