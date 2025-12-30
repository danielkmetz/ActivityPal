import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TextInput, Dimensions, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Switch, Keyboard } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSelector } from 'react-redux';
import TagFriendsModal from '../Reviews/TagFriendsModal';
import SelectFriendsPicker from './InviteModal/SelectFriendsPicker';
import { selectFriends } from '../../Slices/friendsSlice';
import { selectUser } from '../../Slices/UserSlice';
import useSlideDownDismiss from '../../utils/useSlideDown';
import Notch from '../Notch/Notch';
import { medium } from '../../utils/Haptics/haptics';
import useInviteActions from '../../utils/UserInviteActions/userInviteActions';
import LockedPlaceHeader from './InviteModal/LockedPlaceHeader';
import PlacesAutocomplete from '../Location/PlacesAutocomplete';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.9);

/* ------------------------- helpers: recurring logic ------------------------ */

const DAY_LOOKUP = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function dayNameToIndex(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase().trim();
  return DAY_LOOKUP[lower] ?? null;
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildTodayAtTime(baseTime) {
  const now = new Date();
  const dt = new Date(now);
  dt.setHours(baseTime.getHours(), baseTime.getMinutes(), 0, 0);
  return dt;
}

function getNextRecurringOccurrence(baseStart, recurringDays) {
  if (!baseStart || !Array.isArray(recurringDays) || !recurringDays.length) {
    return null;
  }

  const now = new Date();
  const nowMs = now.getTime();
  const baseHour = baseStart.getHours();
  const baseMinute = baseStart.getMinutes();

  const daySet = new Set(
    recurringDays
      .map(dayNameToIndex)
      .filter((d) => d !== null && d !== undefined)
  );
  if (!daySet.size) return null;

  // Look up to 14 days ahead for safety
  for (let offset = 0; offset < 14; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    const weekday = candidate.getDay();
    if (!daySet.has(weekday)) continue;

    candidate.setHours(baseHour, baseMinute, 0, 0);
    if (candidate.getTime() > nowMs) {
      return candidate;
    }
  }

  return null;
}

/**
 * Build a human description of when the event/promo is held.
 */
function buildScheduleDescriptionFromSuggestion(suggestionContent) {
  if (!suggestionContent?.details) return null;

  const { details } = suggestionContent;
  const { startsAt, endsAt, recurring, recurringDays } = details;

  if (!startsAt) return null;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const hasEnd = !!endsAt;
  const end = hasEnd ? new Date(endsAt) : null;
  const startTime = formatTime(start);
  const endTime = hasEnd && !Number.isNaN(end.getTime()) ? formatTime(end) : null;

  if (recurring && Array.isArray(recurringDays) && recurringDays.length) {
    const dayLabels = recurringDays
      .map((name) => {
        const idx = dayNameToIndex(name);
        if (idx == null) return String(name);
        return [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ][idx];
      })
      .filter(Boolean);

    if (!dayLabels.length) return null;

    let daysStr;
    if (dayLabels.length === 1) {
      daysStr = dayLabels[0];
    } else if (dayLabels.length === 2) {
      daysStr = `${dayLabels[0]} and ${dayLabels[1]}`;
    } else {
      daysStr =
        dayLabels.slice(0, -1).join(', ') +
        ' and ' +
        dayLabels[dayLabels.length - 1];
    }

    if (endTime) {
      return `on ${daysStr} between ${startTime} and ${endTime}`;
    }
    return `on ${daysStr} at ${startTime}`;
  }

  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  if (endTime) {
    return `on ${dateLabel} between ${startTime} and ${endTime}`;
  }
  return `on ${dateLabel} at ${startTime}`;
}

/**
 * Returns `null` if dt is valid for this suggestion,
 * or a schedule string if the time is invalid (used in your alert).
 */
function validateAgainstSuggestion(dt, suggestionContent) {
  if (!suggestionContent?.details) return null;

  const { details } = suggestionContent;
  const { startsAt, endsAt, recurring, recurringDays } = details;

  if (!startsAt) return null;

  const baseStart = new Date(startsAt);
  if (Number.isNaN(baseStart.getTime())) return null;

  const baseEnd = endsAt ? new Date(endsAt) : null;
  const schedule = buildScheduleDescriptionFromSuggestion(suggestionContent);

  if (recurring && Array.isArray(recurringDays) && recurringDays.length) {
    const indices = recurringDays
      .map(dayNameToIndex)
      .filter((i) => i !== null && i !== undefined);

    if (indices.length) {
      const chosenDay = dt.getDay();
      if (!indices.includes(chosenDay)) {
        return schedule;
      }
    }
  }

  if (!baseEnd || Number.isNaN(baseEnd.getTime())) {
    return null;
  }

  const baseStartHour = baseStart.getHours();
  const baseStartMinute = baseStart.getMinutes();
  const baseEndHour = baseEnd.getHours();
  const baseEndMinute = baseEnd.getMinutes();

  const startWindow = new Date(dt);
  startWindow.setHours(baseStartHour, baseStartMinute, 0, 0);

  const endWindow = new Date(dt);
  if (baseEnd.getTime() >= baseStart.getTime()) {
    endWindow.setHours(baseEndHour, baseEndMinute, 0, 0);
  } else {
    endWindow.setDate(endWindow.getDate() + 1);
    endWindow.setHours(baseEndHour, baseEndMinute, 0, 0);
  }

  const t = dt.getTime();
  if (t < startWindow.getTime() || t > endWindow.getTime()) {
    return schedule;
  }

  return null;
}

/* ------------------------------- component ------------------------------- */

const InviteModal = ({
  visible,
  onClose,
  isEditing,
  initialInvite,
  setIsEditing,
  setInviteToEdit,
  suggestion,
}) => {
  const user = useSelector(selectUser);
  const friends = useSelector(selectFriends);
  const rawSuggestion = suggestion ?? null;
  const suggestionContent = rawSuggestion?.original ?? rawSuggestion ?? null;
  const fromSharedPost = !!rawSuggestion?.original;
  const getUserId = (u) => u?._id || u?.id || u?.userId || u?.user?._id || u?.user?.id || null;
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [dateTime, setDateTime] = useState(null);
  const [selectedFriends, setSelectedFriends] = useState([]); // array of IDs
  const [isPublic, setIsPublic] = useState(true);
  const [note, setNote] = useState('');
  const googleRef = useRef(null);
  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
  const { sendInviteWithConflicts, editInviteWithConflicts } = useInviteActions(initialInvite);

  /* -------------------- suggestion → suggestedPlace -------------------- */

  const suggestedPlace = useMemo(() => {
    if (!suggestionContent) return null;

    const details = suggestionContent.details || {};

    const rawStart =
      details.startsAt ||
      details.startTime ||
      details.date ||
      suggestionContent.startTime ||
      suggestionContent.startsAt ||
      suggestionContent.date ||
      null;

    const rawEnd = details.endsAt || details.endTime || null;

    let baseStart = null;
    if (rawStart) {
      const t = Date.parse(rawStart);
      if (Number.isFinite(t)) {
        baseStart = new Date(t);
      }
    }

    let baseEnd = null;
    if (rawEnd) {
      const t = Date.parse(rawEnd);
      if (Number.isFinite(t)) {
        baseEnd = new Date(t);
      }
    }

    const recurring =
      typeof details.recurring === 'boolean'
        ? details.recurring
        : !!suggestionContent.recurring;

    const recurringDays =
      Array.isArray(details.recurringDays) && details.recurringDays.length
        ? details.recurringDays
        : suggestionContent.recurringDays || [];

    return {
      placeId: suggestionContent.placeId,
      name: suggestionContent.businessName,
      baseStart,
      baseEnd,
      note: `Let's go to ${suggestionContent.businessName} for ${details.title || suggestionContent.title
        }`,
      recurring,
      recurringDays,
    };
  }, [
    suggestionContent?.placeId,
    suggestionContent?.businessName,
    suggestionContent?.details,
    suggestionContent?.startTime,
    suggestionContent?.startsAt,
    suggestionContent?.date,
    suggestionContent?.title,
    suggestionContent?.recurring,
    suggestionContent?.recurringDays,
  ]);

  const lockPlace = useMemo(() => {
    if (isEditing) return false;
    return !!suggestionContent?.placeId && !!suggestionContent?.businessName;
  }, [isEditing, suggestionContent?.placeId, suggestionContent?.businessName]);

  const lockedPlaceSubtitle = useMemo(() => {
    if (!suggestionContent) return null;
    const schedule = buildScheduleDescriptionFromSuggestion(suggestionContent);
    // schedule already returns phrases like "on Friday at 7:00 PM"
    return schedule ? `Available ${schedule}` : null;
  }, [suggestionContent]);

  /* -------------------------- Prefill when editing -------------------------- */

  useEffect(() => {
    if (!visible) return;
    if (!isEditing || !initialInvite) return;

    const placeId =
      initialInvite.placeId || initialInvite.business?.placeId;
    const name =
      initialInvite.businessName || initialInvite.business?.businessName;

    if (placeId && name) {
      setSelectedPlace({ placeId, name });
      googleRef.current?.setAddressText(name);
    }

    setNote(initialInvite.note || '');

    const rawDt =
      initialInvite.details?.dateTime ||
      initialInvite.dateTime ||
      initialInvite.detailsDateTime ||
      null;

    if (rawDt) {
      const t = Date.parse(rawDt);
      setDateTime(Number.isFinite(t) ? new Date(t) : new Date());
    } else {
      setDateTime(new Date());
    }

    const normalizedIds =
      (initialInvite.details?.recipients || [])
        .map((r) => getUserId(r.user || r))
        .filter(Boolean) || [];
    setSelectedFriends(normalizedIds);
  }, [isEditing, initialInvite, visible]);

  /* ---------------------- Prefill when from suggestion ---------------------- */

  useEffect(() => {
    if (!visible) return;
    if (isEditing) return;
    if (!suggestedPlace) return;

    setSelectedPlace(
      suggestedPlace.placeId && suggestedPlace.name
        ? { placeId: suggestedPlace.placeId, name: suggestedPlace.name }
        : null
    );
    if (suggestedPlace.name) {
      googleRef.current?.setAddressText(suggestedPlace.name);
    }

    const { baseStart, recurring, recurringDays } = suggestedPlace;
    const now = new Date();
    let dt;

    if (baseStart) {
      if (
        fromSharedPost &&
        recurring &&
        Array.isArray(recurringDays) &&
        recurringDays.length
      ) {
        const next = getNextRecurringOccurrence(baseStart, recurringDays);
        dt = next || baseStart;
      } else if (!fromSharedPost) {
        dt = buildTodayAtTime(baseStart);
      } else {
        dt = baseStart;
      }
    } else {
      dt = now;
    }

    setDateTime(dt);
    setNote(suggestedPlace.note || '');
  }, [suggestedPlace, isEditing, visible, fromSharedPost]);

  /* ---------------------- Animate modal in/out ---------------------- */

  useEffect(() => {
    if (visible) {
      animateIn();
    } else {
      (async () => {
        await animateOut();
      })();
    }
  }, [visible]);

  /* -------------------------- Confirm invite -------------------------- */

  const handleConfirmInvite = async () => {
    if (!selectedPlace || !dateTime || selectedFriends.length === 0) {
      alert('Please complete all invite details.');
      return;
    }

    let dt = dateTime;
    if (!(dt instanceof Date)) {
      dt = new Date(dateTime);
    }

    const ts = dt.getTime();
    if (!Number.isFinite(ts)) {
      alert('Invalid date/time. Please pick a different time.');
      return;
    }

    // Validate against suggestion schedule if applicable
    if (!isEditing && suggestionContent) {
      const schedule = validateAgainstSuggestion(dt, suggestionContent);
      if (schedule) {
        alert(
          `Invalid date or time.\n\nThis event or promo is held ${schedule}.`
        );
        return;
      }
    }

    const recipientIds = Array.from(new Set(selectedFriends.filter(Boolean)));

    const invitePayload = {
      senderId: user.id || user._id,
      recipientIds,
      placeId: selectedPlace.placeId,
      businessName: selectedPlace.name,
      dateTime: dt,
      message: '',
      note,
      isPublic,
    };

    try {
      if (isEditing && initialInvite) {
        const updates = {
          placeId: selectedPlace.placeId,
          businessName: selectedPlace.name,
          dateTime: dt,
          note,
          isPublic,
        };

        const { cancelled } = await editInviteWithConflicts({
          inviteIdOverride: initialInvite._id,
          updates,
          recipientIds,
        });

        if (cancelled) return;

        medium();
        setInviteToEdit?.(null);
        setIsEditing?.(false);
        alert('Invite updated!');
      } else {
        const { cancelled } = await sendInviteWithConflicts(invitePayload);
        if (cancelled) return;

        medium();
        alert('Invite sent!');
      }

      setSelectedFriends([]);
      setNote('');
      setSelectedPlace(null);
      setDateTime(null);
      onClose?.();
    } catch (err) {
      alert('Something went wrong. Please try again.');
    }
  };

  /* -------------------------- Friends display list -------------------------- */

  if (!visible) return null;

  const displayFriends = [
    ...friends,
    ...(initialInvite?.details?.recipients?.map((r) => r.user || r) || []),
  ].filter((u, index, self) => {
    const id = getUserId(u);
    return (
      id &&
      selectedFriends.includes(id) &&
      index === self.findIndex((x) => getUserId(x) === id)
    );
  });

  return (
    <Modal visible={visible} transparent onRequestClose={animateOut}>
      <TouchableWithoutFeedback onPress={animateOut}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'position' : 'height'}
            keyboardVerticalOffset={-80}
            style={styles.keyboardAvoiding}
          >
            <GestureDetector gesture={gesture}>
              <Animated.View style={[styles.modalContainer, animatedStyle]}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View>
                    <Notch />
                    <Text style={styles.title}>
                      {isEditing ? 'Edit Vybe Invite' : 'Create Vybe Invite'}
                    </Text>
                    {lockPlace ? (
                      <>
                        <Text style={styles.label}>Place</Text>
                        <LockedPlaceHeader
                          label={fromSharedPost ? "From shared promo/event" : "Suggested"}
                          title={selectedPlace?.name || suggestionContent?.businessName}
                          subtitle={lockedPlaceSubtitle}
                        />
                      </>
                    ) : (
                      <>
                        <Text style={styles.label}>Search for a Place</Text>
                        <PlacesAutocomplete
                          // If you have lat/lng available in this screen, pass them in.
                          lat={null}
                          lng={null}
                          prefillLabel={selectedPlace?.name || ""}
                          onClear={() => {
                            setSelectedPlace(null);
                          }}
                          onPlaceSelected={(details) => {
                            const placeId =
                              details?.place_id ||
                              details?.placeId ||
                              details?.id ||
                              details?.result?.place_id ||
                              details?.result?.placeId ||
                              null;

                            const name =
                              details?.name ||
                              details?.businessName ||
                              details?.result?.name ||
                              "";

                            if (!placeId && !name) return;

                            setSelectedPlace({
                              placeId: placeId || selectedPlace?.placeId || null,
                              name: name || selectedPlace?.name || "",
                            });
                          }}
                        />
                      </>
                    )}
                    <View style={styles.switchContainer}>
                      <Text style={styles.label}>
                        {isPublic ? 'Public Invite 🌍' : 'Private Invite 🔒'}
                      </Text>
                      <Switch
                        value={isPublic}
                        onValueChange={setIsPublic}
                        trackColor={{ false: '#ccc', true: '#4cd137' }}
                        thumbColor={
                          Platform.OS === 'android' ? '#fff' : undefined
                        }
                      />
                    </View>
                    <View style={styles.dateTimeInput}>
                      <Text style={styles.label}>Select Date & Time</Text>
                      <DateTimePicker
                        value={dateTime || new Date()}
                        mode="datetime"
                        display="default"
                        onChange={(event, selectedDate) => {
                          if (selectedDate) {
                            setDateTime(selectedDate);
                          }
                        }}
                      />
                    </View>
                    <View style={styles.noteContainer}>
                      <Text style={styles.label}>Add a Note (optional)</Text>
                      <TextInput
                        style={styles.noteInput}
                        placeholder="Let your friends know what's up..."
                        multiline
                        numberOfLines={3}
                        value={note}
                        onChangeText={setNote}
                      />
                    </View>
                    <SelectFriendsPicker
                      selectedFriends={selectedFriends}
                      displayFriends={displayFriends}
                      onOpenModal={() => setShowFriendsModal(true)}
                      setSelectedFriends={setSelectedFriends}
                    />
                    <TouchableOpacity
                      style={styles.confirmButton}
                      onPress={handleConfirmInvite}
                    >
                      <Text style={styles.confirmText}>
                        {isEditing ? 'Save Edit' : 'Send Invite'}
                      </Text>
                    </TouchableOpacity>
                    <TagFriendsModal
                      visible={showFriendsModal}
                      onClose={() => setShowFriendsModal(false)}
                      onSave={(selected) => {
                        const ids = selected.map(
                          (friend) => friend._id || friend.id
                        );
                        setSelectedFriends(ids);
                        setShowFriendsModal(false);
                      }}
                      isEventInvite={true}
                    />
                  </View>
                </TouchableWithoutFeedback>
              </Animated.View>
            </GestureDetector>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    width: '100%',
    maxHeight: MAX_SHEET_HEIGHT,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 20 },
  confirmButton: {
    backgroundColor: '#009999',
    padding: 14,
    borderRadius: 8,
    marginVertical: 16,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 4, color: '#555' },
  dateTimeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
  },
  keyboardAvoiding: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  noteContainer: { marginBottom: 16 },
  noteInput: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: '#f9f9f9',
    textAlignVertical: 'top',
  },
});

export default InviteModal;
