import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Animated } from 'react-native';
import InviteeModal from '../ActivityInvites/InviteeModal/InviteeModal';
import { formatEventDate } from '../../functions';
import { deleteInvite } from '../../Slices/PostsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from 'react-redux';
import InviteModal from '../ActivityInvites/InviteModal';
import PostActions from './PostActions/PostActions';
import PostOptionsMenu from './PostOptionsMenu';
import { useNavigation } from '@react-navigation/native';
import InviteHeader from './Invites/InviteHeader';
import CountdownPill from './Invites/CountdownPill';
import AttendanceRow from './Invites/AttendanceRow';
import { useInviteState } from './Invites/useInviteState';
import { medium } from '../../utils/Haptics/haptics';
import NonOwnerOptions from './PostOptionsMenu/NonOwnerPostOptions';
import ViewerOptionsTrigger from './PostOptionsMenu/ViewerOptionsTrigger';
import BusinessLink from './PostHeader/BusinessLink';
import useInviteActions from '../../utils/UserInviteActions/userInviteActions';
import PhotoFeed from './Photos/PhotoFeed';

const InviteCard = ({ invite, handleOpenComments, onShare, embeddedInShared, photoTapped, setPhotoTapped }) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const postContent = invite?.original ?? invite ?? {};
  const [modalVisible, setModalVisible] = useState(false);
  const [editInviteModal, setEditInviteModal] = useState(false);
  const [inviteToEdit, setInviteToEdit] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);
  const [activeMediaItem, setActiveMediaItem] = useState(null);
  const user = useSelector(selectUser);
  const userId = user?.id || user?._id;
  const owner = postContent?.owner;
  const details = postContent?.details;
  const dateTime = details?.dateTime;
  const message = postContent?.message;
  const isMedia =
    (Array.isArray(postContent?.media) && postContent.media.length > 0) ||
    (Array.isArray(postContent?.photos) && postContent.photos.length > 0);

  const totalInvited = Array.isArray(details?.recipients) ? details.recipients.length : 0;
  const senderId = owner?.id || owner?._id || owner?.userId || null;
  const [requested, setRequested] = useState(false);
  const hasRequested = requested || (details?.requests || []).some((r) => String(r.userId) === String(userId));

  const scrollX = useRef(new Animated.Value(0)).current;
  const { timeLeft, isSender } = useInviteState(postContent, userId);

  // centralize invite actions for THIS invite
  const { requestToJoin } = useInviteActions(invite);

  // ✅ recap flag from backend enrichment
  const needsRecap = !!postContent?.details?.needsRecap;

  // ✅ compute "is this invite more than 2 hours in the past?"
  let isPastTwoHours = false;
  if (dateTime) {
    let dt = dateTime instanceof Date ? dateTime : new Date(dateTime);
    if (!Number.isNaN(dt.getTime())) {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      isPastTwoHours = dt <= twoHoursAgo;
    }
  }

  const handleEdit = () => {
    if (invite) {
      navigation.navigate('CreatePost', {
        postType: 'invite',
        isEditing: true,
        initialPost: invite,
      });
    }
  };

  const handleDelete = (inviteToDelete) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete your event?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const recipientIds = (inviteToDelete.details.recipients || []).map(
                (r) => r.userId
              );

              await dispatch(
                deleteInvite({
                  senderId: userId,
                  inviteId: inviteToDelete._id,
                  recipientIds,
                })
              ).unwrap();

              medium();
              setIsEditing(false);
              setInviteToEdit(null);
              Alert.alert('Invite Deleted', 'The invite was successfully removed.');
            } catch (err) {
              console.error('❌ Failed to delete invite:', err);
              Alert.alert('Error', 'Could not delete the invite. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleRequest = async () => {
    const ok = await requestToJoin();
    if (ok) {
      setRequested(true);
    }
  };

  const navigateToOtherUserProfile = (uid) => {
    if (String(uid) !== String(userId)) {
      navigation.navigate('OtherUserProfile', { userId: uid });
    } else {
      navigation.navigate('Profile');
    }
  };

  useEffect(() => {
    if ((details?.requests || []).some((r) => String(r.userId) === String(userId))) {
      setRequested(true);
    }
  }, [invite, userId]);

  return (
    <>
      <View style={styles.card}>
        <PostOptionsMenu
          dropdownVisible={dropdownVisible}
          setDropdownVisible={setDropdownVisible}
          handleEdit={handleEdit}
          handleDelete={handleDelete}
          postData={invite}
          embeddedInShared={embeddedInShared}
        />
        <ViewerOptionsTrigger
          post={invite}
          onPress={() => setViewerOptionsVisible(true)}
          embeddedInShared={embeddedInShared}
        />
        <InviteHeader
          sender={owner}
          totalInvited={totalInvited}
          onPressName={() => navigateToOtherUserProfile(senderId)}
        />
        <BusinessLink post={invite} />
        {dateTime ? (
          <Text style={[styles.datetime, isMedia && !message && { marginBottom: 15 }]}>On {formatEventDate(dateTime)}</Text>
        ) : null}
        {message ? <Text style={[styles.note, isMedia && { marginBottom: 15 }]}>{message}</Text> : null}
        {!isMedia && (
          <CountdownPill value={timeLeft} />
        )}
        <PhotoFeed
          scrollX={scrollX}
          post={invite}
          photoTapped={photoTapped}
          setPhotoTapped={setPhotoTapped}
          onActiveMediaChange={setActiveMediaItem} // ✅ PhotoFeed will set initial + on swipe
        />
        {/* 🔹 The row that will now own both the request button AND recap badge */}
        <AttendanceRow
          hasRequested={hasRequested}
          onRequestJoin={handleRequest}
          onOpenInvitees={() => setModalVisible(true)}
          post={invite}
          needsRecap={needsRecap}
          isPastTwoHours={isPastTwoHours}
        />
        <PostActions
          post={invite}
          handleOpenComments={handleOpenComments}
          onShare={onShare}
          embeddedInShared={embeddedInShared}
        />
      </View>
      <InviteeModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        isSender={isSender}
        invite={invite}
      />
      <InviteModal
        visible={editInviteModal}
        onClose={() => setEditInviteModal(false)}
        setShowInviteModal={setEditInviteModal}
        initialInvite={inviteToEdit}
        setInviteToEdit={setInviteToEdit}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />
      <NonOwnerOptions
        visible={viewerOptionsVisible}
        post={invite}
        onClose={() => setViewerOptionsVisible(false)}
        isFollowing={true}
        embeddedInShared={embeddedInShared}
      />
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 10,
    marginBottom: 8,
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  datetime: {
    fontSize: 13,
    color: '#666',
  },
  note: {
    fontStyle: 'italic',
    color: '#555',
    marginTop: 10,
  },
});

export default InviteCard;
