import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Switch,
  Platform,
} from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useDispatch, useSelector } from 'react-redux';
import { sendInvite, editInvite } from '../../Slices/InvitesSlice';
import { selectFriends } from '../../Slices/friendsSlice';
import { FontAwesome } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { selectUserAndFriendsReviews, setUserAndFriendsReviews } from '../../Slices/ReviewsSlice';
import { googlePlacesDefaultProps } from '../../utils/googleplacesDefaults';
import TagFriendsModal from '../Reviews/TagFriendsModal';

const google_key = process.env.EXPO_PUBLIC_GOOGLE_KEY;

export default function InviteForm({ isEditing = false, initialInvite = null }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const friends = useSelector(selectFriends);
  const userAndFriendReviews = useSelector(selectUserAndFriendsReviews);

  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [dateTime, setDateTime] = useState(null);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [isPublic, setIsPublic] = useState(true);
  const [note, setNote] = useState('');
  const googleRef = useRef(null);

  useEffect(() => {
    if (isEditing && initialInvite) {
      const placeId = initialInvite.placeId || initialInvite.business?.placeId;
      const name = initialInvite.businessName || initialInvite.business?.businessName;
      if (placeId && name) {
        setSelectedPlace({ placeId, name });
        googleRef.current?.setAddressText(name);
      }

      setNote(initialInvite.note || '');
      setDateTime(new Date(initialInvite.dateTime));

      const normalizedIds =
        initialInvite.recipients?.map(r => getUserId(r.user || r)) || [];

      setSelectedFriends(normalizedIds);
    }
  }, [isEditing, initialInvite]);

  const getUserId = (user) => {
    return user?._id || user?.id || user?.userId || user?.user?._id || user?.user?.id;
  };

  const handleConfirmInvite = async () => {
    if (!selectedPlace || !dateTime || selectedFriends.length === 0) {
      alert('Please complete all invite details.');
      return;
    }

    const invitePayload = {
      senderId: user.id,
      recipientIds: selectedFriends,
      placeId: selectedPlace.placeId,
      businessName: selectedPlace.name,
      dateTime,
      note,
      isPublic,
    };

    try {
      let finalFeed = [...(userAndFriendReviews || [])];

      if (isEditing && initialInvite) {
        const updates = {
          placeId: selectedPlace.placeId,
          businessName: selectedPlace.name,
          dateTime,
          note,
          isPublic,
        };

        const { payload: updatedInvite } = await dispatch(editInvite({
          recipientId: user.id,
          inviteId: initialInvite._id,
          updates,
          recipientIds: selectedFriends,
          businessName: selectedPlace.name,
        }));

        finalFeed = updateFeedWithItem(finalFeed, {
          ...updatedInvite,
          type: 'invite',
          createdAt: updatedInvite.dateTime,
        });

        alert('Invite updated!');
      } else {
        const { payload: newInvite } = await dispatch(sendInvite(invitePayload));

        finalFeed = updateFeedWithItem(finalFeed, {
          ...newInvite.invite,
          type: 'invite',
          createdAt: newInvite.invite.dateTime,
        });

        alert('Invite sent!');
      }

      dispatch(setUserAndFriendsReviews(finalFeed));
    } catch (err) {
      alert('Something went wrong. Please try again.');
    }
  };

  const updateFeedWithItem = (feed, item) => {
    const normalized = (feed || [])
      .filter(f => f._id !== item._id)
      .concat(item)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return normalized;
  };

  const displayFriends = [...friends].filter(friend =>
    selectedFriends.includes(getUserId(friend))
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <GooglePlacesAutocomplete
        ref={googleRef}
        placeholder="Search for a location"
        onPress={(data) => {
          setSelectedPlace({
            placeId: data?.place_id,
            name: data?.structured_formatting?.main_text,
          });
        }}
        query={{ key: google_key, language: 'en' }}
        styles={{
          textInput: styles.input,
          listView: {
            maxHeight: 300,
            zIndex: 999,
          },
        }}
        fetchDetails
        {...googlePlacesDefaultProps}
      />

      <View style={styles.switchContainer}>
        <View style={styles.switchLabelContainer}>
          {isPublic ? (
            <FontAwesome name="globe" size={20} color="black" style={styles.icon} />
          ) : (
            <FontAwesome name="lock" size={20} color="black" style={styles.icon} />
          )}
          <Text style={styles.label}>{isPublic ? 'Public' : 'Private'}</Text>
        </View>
        <Switch
          value={isPublic}
          onValueChange={setIsPublic}
          trackColor={{ false: '#ccc', true: '#009999' }}
          thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
        />
      </View>

      <Text style={styles.label}>Date & Time</Text>
      <DateTimePicker
        value={dateTime || new Date()}
        mode="datetime"
        display="default"
        onChange={(event, selectedDate) => selectedDate && setDateTime(selectedDate)}
      />

      <Text style={[styles.label, { marginTop: 30 }]}>Note (optional)</Text>
      <TextInput
        style={styles.noteInput}
        placeholder="Let your friends know what's up..."
        multiline
        value={note}
        onChangeText={setNote}
      />

      <TouchableOpacity
        style={styles.friendButton}
        onPress={() => setShowFriendsModal(true)}
      >
        <Text style={styles.friendButtonText}>
          {selectedFriends.length > 0 ? `👥 ${selectedFriends.length} Selected` : '➕ Select Friends'}
        </Text>
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} >
        {displayFriends.map(friend => (
          <View key={getUserId(friend)} style={styles.friendPreview}>
            <Image
              source={
                friend.presignedProfileUrl
                  ? { uri: friend.presignedProfileUrl }
                  : require('../../assets/pics/profile-pic-placeholder.jpg')
              }
              style={styles.profilePic}
            />
            <Text style={styles.friendName}>{friend.firstName}</Text>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmInvite}>
        <Text style={styles.confirmText}>{isEditing ? 'Save Edit' : 'Send Invite'}</Text>
      </TouchableOpacity>

      <TagFriendsModal
        visible={showFriendsModal}
        onClose={() => setShowFriendsModal(false)}
        onSave={(selected) => {
          const ids = selected.map(f => f._id);
          setSelectedFriends(ids);
          setShowFriendsModal(false);
        }}
        isEventInvite
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 100,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginVertical: 10,
  },
  input: {
    backgroundColor: "#f5f5f5",
    height: 50,
    borderRadius: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    fontSize: 16,
  },
  noteInput: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: '#f9f9f9',
    textAlignVertical: 'top',
    marginBottom: 16,
    height: 150
  },
  friendButton: {
    backgroundColor: '#33cccc',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  friendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  friendPreview: {
    flexDirection: 'column',
    alignItems: 'center',
    marginRight: 12,
  },
  profilePic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 4,
  },
  friendName: {
    fontSize: 12,
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: '#009999',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  switchLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  icon: {
    marginRight: 8,
  },

});
