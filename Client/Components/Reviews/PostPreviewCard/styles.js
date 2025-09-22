import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  card: {
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderColor: '#ccc',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flexShrink: 1,
  },
  subtle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  media: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  reviewText: {
    fontSize: 14,
    color: '#333',
  },
  pinPic: {
    width: 16,
    height: 16,
    marginLeft: 5,
  },
  dateChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#111',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  dateChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  livePill: {
    backgroundColor: '#E50914',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  livePillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
  },
  placeholderEmoji: { fontSize: 28, opacity: 0.85 },
});
