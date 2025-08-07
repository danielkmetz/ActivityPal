import React from 'react';
import { View, StyleSheet } from 'react-native';
import CheckInItem from '../CheckInItem';
import ReviewItem from '../ReviewItem';
import SuggestionItem from '../SuggestionItem';
import InviteCard from '../InviteCard';

export default function SharedPostContent({
  sharedItem,
  animation,
  photoTapped,
  toggleTaggedUsers,
  handleLikeWithAnimation,
  handleOpenComments,
  lastTapRef,
  handleEdit,
  handleDelete,
  following,
  followRequests,
  onShare,
}) {
  if (!sharedItem) return null;

  const sharedType = sharedItem?.type;

  const renderSharedItem = () => {
    switch (sharedType) {
      case 'check-in':
        return (
          <CheckInItem
            item={sharedItem}
            animation={animation}
            photoTapped={photoTapped}
            toggleTaggedUsers={toggleTaggedUsers}
            handleLikeWithAnimation={handleLikeWithAnimation}
            handleLike={handleLikeWithAnimation}
            handleOpenComments={handleOpenComments}
            lastTapRef={lastTapRef}
            handleDelete={handleDelete}
            handleEdit={handleEdit}
            following={following}
            followRequests={followRequests}
            onShare={onShare}
            sharedPost={true}
          />
        );

      case 'review':
        return (
          <ReviewItem
            item={sharedItem}
            animation={animation}
            photoTapped={photoTapped}
            toggleTaggedUsers={toggleTaggedUsers}
            handleLikeWithAnimation={handleLikeWithAnimation}
            handleOpenComments={handleOpenComments}
            lastTapRef={lastTapRef}
            handleDelete={handleDelete}
            handleEdit={handleEdit}
            following={following}
            followRequests={followRequests}
            onShare={onShare}
            sharedPost={true}
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
            sharedPost={true}
          />
        );

      case 'invite':
        return (
          <InviteCard
            invite={sharedItem}
            handleLikeWithAnimation={handleLikeWithAnimation}
            handleOpenComments={handleOpenComments}
            onShare={onShare}
            sharedPost={true}
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
    width: '90%',
    alignSelf: 'center',
  },
});
