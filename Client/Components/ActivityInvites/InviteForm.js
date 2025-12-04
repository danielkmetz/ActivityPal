import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Platform,
} from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useDispatch, useSelector } from 'react-redux';
import { sendInvite, editInvite } from '../../Slices/PostsSlice';
import { selectFriends } from '../../Slices/friendsSlice';
import { FontAwesome } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { googlePlacesDefaultProps } from '../../utils/googleplacesDefaults';
import TagFriendsModal from '../Reviews/TagFriendsModal';
import { useNavigation } from '@react-navigation/native';
import SectionHeader from '../Reviews/SectionHeader';
import FriendPills from '../Reviews/FriendPills';
import { medium } from '../../utils/Haptics/haptics';

const google_key = process.env.EXPO_PUBLIC_GOOGLE_KEY;

export default function InviteForm({ isEditing = false, initialInvite = null }) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const friends = useSelector(selectFriends);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [dateTime, setDateTime] = useState(null);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [isPublic, setIsPublic] = useState(true);
  const [note, setNote] = useState('');
  const googleRef = useRef(null);
  const toId = (u) => u?._id || u?.id || u?.userId || u?.user?._id || u?.user?.id || null;

  useEffect(() => {
    if (isEditing && initialInvite) {
      const placeId = initialInvite.placeId || initialInvite.business?.placeId;
      const name = initialInvite.businessName || initialInvite.business?.businessName;

      if (placeId && name) {
        setSelectedPlace({ placeId, name });
        googleRef.current?.setAddressText(name);
      }

      setNote(initialInvite.note || '');

      // 👇 pull date from details.dateTime first
      const rawDate =
        initialInvite.details?.dateTime ||
        initialInvite.dateTime ||
        initialInvite.sortDate ||
        initialInvite.createdAt;

      setDateTime(rawDate ? new Date(rawDate) : new Date());

      // 👇 recipients also live under details
      const selectedAsObjects = (initialInvite.details?.recipients || [])
        .map((r) => {
          const id = toId(r.user || r);
          if (!id) return null;

          const fromFriends = (friends || []).find((f) => toId(f) === id);
          if (fromFriends) return fromFriends;

          const src = r.user || r;
          return {
            _id: id,
            id,
            userId: id,
            firstName: src?.firstName,
            lastName: src?.lastName,
            username:
              src?.username ||
              src?.fullName ||
              src?.firstName ||
              'Unknown',
            profilePicUrl: src?.profilePicUrl || src?.presignedProfileUrl || null,
          };
        })
        .filter(Boolean);

      setSelectedFriends(selectedAsObjects);
    }
  }, [isEditing, initialInvite, friends]);

  const handleConfirmInvite = async () => {
    if (!selectedPlace || !dateTime || selectedFriends.length === 0) {
      alert('Please complete all invite details.');
      return;
    }

    // Always pass IDs to backend
    const recipientIds = Array.from(
      new Set(selectedFriends.map((f) => toId(f)).filter(Boolean))
    );

    const base = {
      senderId: user.id,
      recipientIds,
      placeId: selectedPlace.placeId,
      businessName: selectedPlace.name,
      dateTime,
      note,
      isPublic,
    };

    try {
      if (isEditing && initialInvite) {
        const updates = {
          placeId: selectedPlace.placeId,
          businessName: selectedPlace.name,
          dateTime,
          note,
          isPublic,
        };

        await dispatch(
          editInvite({
            recipientId: user.id,
            inviteId: initialInvite._id,
            updates,
            recipientIds, // keep recipients in sync
          })
        );

        medium();
        alert('Invite updated!');
      } else {
        await dispatch(sendInvite(base));
        medium();
        alert('Invite sent!');
      }

      navigation.goBack();
    } catch (err) {
      console.error(err);
      alert('Something went wrong. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
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
          listView: { maxHeight: 300, zIndex: 999 },
        }}
        fetchDetails
        {...googlePlacesDefaultProps}
      />
      <SectionHeader title="Visibility" />
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
      <View style={{ marginTop: 10 }}>
        <SectionHeader title="Date & Time" />
        <View style={{ marginTop: 5, marginLeft: -10 }}>
          <DateTimePicker
            value={dateTime || new Date()}
            mode="datetime"
            display="default"
            onChange={(event, selectedDate) => selectedDate && setDateTime(selectedDate)}
          />
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <SectionHeader title="Note (Optional)" />
        <TextInput
          style={styles.noteInput}
          placeholder="Let your friends know what's up..."
          multiline
          value={note}
          onChangeText={setNote}
        />
      </View>
      <TouchableOpacity
        style={styles.friendButton}
        onPress={() => setShowFriendsModal(true)}
      >
        <Text style={styles.friendButtonText}>
          {selectedFriends.length > 0
            ? `👥 ${selectedFriends.length} Selected`
            : '➕ Select Friends'}
        </Text>
      </TouchableOpacity>
      <FriendPills
        friends={selectedFriends}
        onRemove={(userToRemove) => {
          const id = toId(userToRemove);
          setSelectedFriends((prev) =>
            prev.filter((u) => toId(u) !== id)
          );
        }}
      />
      <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmInvite}>
        <Text style={styles.confirmText}>{isEditing ? 'Save Edit' : 'Send Invite'}</Text>
      </TouchableOpacity>
      <TagFriendsModal
        visible={showFriendsModal}
        onClose={() => setShowFriendsModal(false)}
        onSave={(selected) => {
          setSelectedFriends(selected);
          setShowFriendsModal(false);
        }}
        isEventInvite
        initialSelectedFriends={selectedFriends}
      />
    </View>
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
    backgroundColor: '#f5f5f5',
    height: 50,
    borderRadius: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ccc',
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
    marginTop: 5,
    height: 80,
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
