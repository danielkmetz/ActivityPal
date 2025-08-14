import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Rating } from 'react-native-ratings';
import SectionHeader from '../SectionHeader';
import PriceRating from '../metricRatings/PriceRating';
import AtmosphereRating from '../metricRatings/AtmosphereRating';
import ServiceSlider from '../metricRatings/ServiceSlider';
import WouldRecommend from '../metricRatings/WouldRecommend';

/**
 * Props:
 *  - rating, setRating                     (number 1–5)
 *  - priceRating, setPriceRating           (number|null; 1–4)
 *  - serviceRating, setServiceRating       (number 1–5)
 *  - atmosphereRating, setAtmosphereRating (number 1–5)
 *  - wouldRecommend, setWouldRecommend     (boolean)
 *  - reviewText, setReviewText             (string)
 *
 *  - containerStyle (optional)             (style override)
 */
export default function ReviewForm({
  rating,
  setRating,
  priceRating,
  setPriceRating,
  serviceRating,
  setServiceRating,
  atmosphereRating,
  setAtmosphereRating,
  wouldRecommend,
  setWouldRecommend,
  reviewText,
  setReviewText,
  containerStyle,
}) {
  return (
    <View style={[styles.container, containerStyle]}>
      <SectionHeader title="Ratings" />
      <View style={styles.metricCard}>
        <View style={{ alignItems: 'flex-start', marginBottom: 5 }}>
          <Text style={[styles.label, { marginRight: 5 }]}>Overall</Text>
          <View style={{ backgroundColor: '#f9f9f9' }}>
            <Rating
              count={5}
              startingValue={rating || 3}
              onFinishRating={setRating}
              imageSize={30}
            />
          </View>
        </View>

        <PriceRating value={priceRating} onChange={setPriceRating} />
        <ServiceSlider value={serviceRating} onChange={setServiceRating} />
        <AtmosphereRating value={atmosphereRating} onChange={setAtmosphereRating} />
        <WouldRecommend value={wouldRecommend} onChange={setWouldRecommend} />
      </View>

      <SectionHeader title="Your review" />
      <TextInput
        style={styles.textArea}
        value={reviewText}
        onChangeText={setReviewText}
        multiline
        placeholder="Share details about your experience…"
        placeholderTextColor="#999"
        textAlignVertical="top"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { },
  label: { fontSize: 14, fontWeight: '500', marginVertical: 10 },
  metricCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    height: 100,
    backgroundColor: '#fff',
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 15,
    marginTop: 5,
  },
});
