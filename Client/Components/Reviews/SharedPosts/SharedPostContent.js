import React from 'react';
import { View, StyleSheet } from 'react-native';
import CheckInItem from '../CheckInItem';
import ReviewItem from '../ReviewItem';
import SuggestionItem from '../SuggestionItem';
import InviteCard from '../InviteCard';

export default function SharedPostContent({
  sharedItem,
  photoTapped,
  setPhotoTapped,
  handleEdit,
  handleDelete,
  onShare,
}) {
  if (!sharedItem) return null;
  const sharedType = sharedItem?.original?.type;

  const renderSharedItem = () => {
    switch (sharedType) {
      case 'check-in':
        return (
          <CheckInItem
            item={sharedItem}
            photoTapped={photoTapped}
            setPhotoTapped={setPhotoTapped}
            handleDelete={handleDelete}
            handleEdit={handleEdit}
            onShare={onShare}
            embeddedInShared={true}
          />
        );

      case 'review':
        return (
          <ReviewItem
            item={sharedItem}
            photoTapped={photoTapped}
            setPhotoTapped={setPhotoTapped}
            handleDelete={handleDelete}
            handleEdit={handleEdit}
            onShare={onShare}
            embeddedInShared={true}
          />
        );

      case 'suggestion':
      case 'promotion':
      case 'promo':
      case 'event':
        return (
          <SuggestionItem
            suggestion={sharedItem}
            onShare={onShare}
            embeddedInShared={true}
          />
        );

      case 'invite':
        return (
          <InviteCard
            invite={sharedItem}
            onShare={onShare}
            embeddedInShared={true}
          />
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.sharedPostBorder}>
      {renderSharedItem()}
    </View>
  );
}

const styles = StyleSheet.create({
  sharedPostBorder: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    marginBottom: 15,
    backgroundColor: '#f9f9f9',
    width: '97%',
    alignSelf: 'center',
  },
});
