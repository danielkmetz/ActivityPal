import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Rating } from 'react-native-ratings';
import SectionHeader from '../SectionHeader';
import PriceRating from '../metricRatings/PriceRating';

const MAX_VIBE_TAGS = 3;
const VIBE_OPTIONS = [
  'Chill',
  'Lively',
  'Party',
  'Good for groups',
  'Date spot',
  'Solo-friendly',
  'Family-friendly',
  'Sportsy',
];

/**
 * Props:
 *  - rating, setRating                 (number 1–5, REQUIRED)
 *  - wouldGoBack, setWouldGoBack      ('yes' | 'maybe' | 'no' | null, REQUIRED)
 *  - vibeTags, setVibeTags            (string[]; max 3, optional)
 *  - priceRating, setPriceRating      (number|null; 1–4, optional)
 *  - reviewText, setReviewText        (string, optional)
 *  - containerStyle (optional)
 *
 * Enforce the "required" rules in the parent submit handler:
 *  - block submit if !rating or !wouldGoBack
 */
export default function ReviewForm({
  rating,
  setRating,
  wouldGoBack,
  setWouldGoBack,
  vibeTags,
  setVibeTags,
  priceRating,
  setPriceRating,
  reviewText,
  setReviewText,
  containerStyle,
}) {
  const [showOptional, setShowOptional] = useState(false);
  const selectedVibes = Array.isArray(vibeTags) ? vibeTags : [];

  const handleToggleVibe = (tag) => {
    const current = Array.isArray(vibeTags) ? vibeTags : [];
    const isSelected = current.includes(tag);

    if (isSelected) {
      setVibeTags(current.filter((t) => t !== tag));
      return;
    }

    if (current.length >= MAX_VIBE_TAGS) return;

    setVibeTags([...current, tag]);
  };

  const handleSetWouldGoBack = (value) => {
    setWouldGoBack(value); // 'yes' | 'maybe' | 'no'
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {/* HOW WAS IT? */}
      <SectionHeader title="How was it?" />
      <View style={styles.card}>
        <Text style={styles.label}>Overall (required)</Text>
        <View style={styles.ratingWrapper}>
          <Rating
            count={5}
            startingValue={rating || 0}
            onFinishRating={setRating}
            imageSize={28}
          />
        </View>
        <Text style={[styles.label, { marginTop: 16 }]}>
          Would you go back? (required)
        </Text>
        <View style={styles.choiceRow}>
          {[
            { value: 'yes', label: 'Yes' },
            { value: 'maybe', label: 'Maybe' },
            { value: 'no', label: 'No' },
          ].map((opt) => {
            const isActive = wouldGoBack === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pill, isActive && styles.pillActive]}
                onPress={() => handleSetWouldGoBack(opt.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {/* OPTIONAL DETAILS DROPDOWN INSIDE THIS CARD */}
        <TouchableOpacity
          style={styles.optionalToggle}
          onPress={() => setShowOptional((prev) => !prev)}
          activeOpacity={0.8}
        >
          <Text style={styles.optionalToggleText}>
            {showOptional ? 'Hide extra details' : 'Add vibe & price (optional)'}
          </Text>
          <Text style={styles.chevron}>{showOptional ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showOptional && (
          <View style={styles.optionalBlock}>
            <PriceRating value={priceRating} onChange={setPriceRating} />
            <Text style={styles.label}>Pick up to 3 vibes (optional)</Text>
            <View style={styles.vibeWrap}>
              {VIBE_OPTIONS.map((tag) => {
                const isSelected = selectedVibes.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.vibeChip, isSelected && styles.vibeChipActive]}
                    onPress={() => handleToggleVibe(tag)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.vibeChipText,
                        isSelected && styles.vibeChipTextActive,
                      ]}
                    >
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
      {/* SHORT BLURB */}
      <SectionHeader title="What would you tell a friend? (optional)" />
      <TextInput
        style={styles.textArea}
        value={reviewText || ''}
        onChangeText={setReviewText}
        multiline
        placeholder="Short and honest is perfect…"
        placeholderTextColor="#999"
        textAlignVertical="top"
        maxLength={200}
      />
      <Text style={styles.charCount}>
        {(reviewText || '').length}/200
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  card: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  ratingWrapper: {
    paddingVertical: 4,
  },
  choiceRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ccc',
    marginRight: 8,
  },
  pillActive: {
    borderColor: '#111',
    backgroundColor: '#111',
  },
  pillText: {
    fontSize: 13,
    color: '#333',
  },
  pillTextActive: {
    color: '#fff',
  },
  optionalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  optionalToggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
  },
  chevron: {
    fontSize: 12,
    color: '#555',
  },
  optionalBlock: {
    marginTop: 10,
  },
  vibeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  vibeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 6,
    marginBottom: 6,
  },
  vibeChipActive: {
    borderColor: '#111',
    backgroundColor: '#111',
  },
  vibeChipText: {
    fontSize: 12,
    color: '#333',
  },
  vibeChipTextActive: {
    color: '#fff',
  },
  textArea: {
    height: 100,
    backgroundColor: '#fff',
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 4,
    marginTop: 5,
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 11,
    color: '#999',
    marginBottom: 8,
  },
});
