import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Switch,
    Keyboard,
} from 'react-native';
import Animated from 'react-native-reanimated';
import TagFriendsModal from '../Reviews/TagFriendsModal';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { selectFriends } from '../../Slices/friendsSlice';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSelector, useDispatch } from 'react-redux';
import { sendInvite, editInvite } from '../../Slices/InvitesSlice';
import { selectUser } from '../../Slices/UserSlice';
import { GestureDetector } from 'react-native-gesture-handler';
import { addPostToFeeds } from '../../Slices/ReviewsSlice';
import useSlideDownDismiss from '../../utils/useSlideDown';
import { googlePlacesDefaultProps } from '../../utils/googleplacesDefaults';
import Notch from '../Notch/Notch';
import { medium } from '../../utils/Haptics/haptics';
import SelectFriendsPicker from './InviteModal/SelectFriendsPicker';

const google_key = process.env.EXPO_PUBLIC_GOOGLE_KEY;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.9);

const InviteModal = ({
    visible,
    onClose,
    isEditing,
    initialInvite,
    setIsEditing,
    setInviteToEdit,
    suggestion,
}) => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const friends = useSelector(selectFriends);
    const suggestionContent = suggestion?.original ? suggestion?.original : suggestion;
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [dateTime, setDateTime] = useState(null);
    const [selectedFriends, setSelectedFriends] = useState([]);
    const [isPublic, setIsPublic] = useState(true);
    const [note, setNote] = useState('');
    const googleRef = useRef(null);
    const { gesture, animateIn, animateOut, animatedStyle, } = useSlideDownDismiss(onClose);

    const suggestedPlace = useMemo(() => {
        if (!suggestionContent) return null;
        return {
            placeId: suggestionContent.placeId,
            name: suggestionContent.businessName,
            startTime: suggestionContent.startTime,
            note: `Lets go to ${suggestionContent.businessName} for ${suggestionContent.title}`,
        };
    }, [
        suggestionContent?.placeId,
        suggestionContent?.businessName,
        suggestionContent?.startTime,
        suggestionContent?.title,
    ]);

    useEffect(() => {
        if (isEditing && initialInvite && visible) {
            const placeId = initialInvite.placeId || initialInvite.business?.placeId;
            const name = initialInvite.businessName || initialInvite.business?.businessName;

            if (placeId && name) {
                setSelectedPlace({ placeId, name });
                googleRef.current?.setAddressText(name);
            }

            setNote(initialInvite.note || '');
            setDateTime(new Date(initialInvite.dateTime));

            const normalizedIds =
                initialInvite.recipients?.map(r =>
                    getUserId(r.user || r)
                ) || [];

            setSelectedFriends(normalizedIds);
        }
    }, [isEditing, initialInvite, visible]);

    useEffect(() => {
        if (!isEditing && suggestedPlace && visible) {
            setSelectedPlace({
                placeId: suggestedPlace.placeId,
                name: suggestedPlace.name,
            });

            // Populate the GooglePlaces input field
            googleRef.current?.setAddressText(suggestedPlace.name);

            const suggestionTime = new Date(suggestedPlace.startTime);

            setDateTime(suggestionTime);
            setNote(suggestedPlace.note);
        }
    }, [suggestedPlace, isEditing, visible]);

    useEffect(() => {
        if (visible) {
            animateIn();            // Animate it in
        } else {
            // Animate it out and hide the modal
            (async () => {
                await animateOut();
                onClose();
            })();
        }
    }, [visible]);

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
            message: '',
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
                const { payload: updatedInvite } = await dispatch(editInvite({
                    recipientId: user.id,
                    inviteId: initialInvite._id,
                    updates,
                    recipientIds: selectedFriends,
                    businessName: selectedPlace.name,
                }));

                await dispatch(addPostToFeeds(updatedInvite));
                medium();
                setInviteToEdit(null);
                setIsEditing(false);
                alert('Invite updated!');
            } else {
                const { payload: newInvite } = await dispatch(sendInvite(invitePayload));

                await dispatch(addPostToFeeds(newInvite?.invite));
                medium();
                alert('Invite sent!');
            }

            setSelectedFriends([]);
            setNote('');
            setSelectedPlace(null);
            setDateTime(null);
            setSelectedFriends([]);
            onClose();
        } catch (err) {
            console.error('❌ Failed to send invite:', err);
            alert('Something went wrong. Please try again.');
        }
    };

    if (!visible) return null;

    const getUserId = (user) => {
        return user?._id || user?.id || user?.userId || user?.user?._id || user?.user?.id;
    };

    const displayFriends = [
        ...friends,
        ...(initialInvite?.recipients?.map(r => r.user || r) || [])
    ]
        .filter((user, index, self) => {
            const id = getUserId(user);

            return (
                id &&
                selectedFriends.includes(id) &&
                index === self.findIndex(u => getUserId(u) === id)
            );
        });

    return (
        <Modal
            visible={visible}
            transparent
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={animateOut}>
                <View style={styles.overlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'position' : 'height'}
                        keyboardVerticalOffset={-80}
                        style={styles.keyboardAvoiding}
                    >
                        <GestureDetector
                            gesture={gesture}
                        >
                            <Animated.View style={[styles.modalContainer, animatedStyle]}>
                                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                                    <View>
                                        <Notch />
                                        <Text style={styles.title}>Create Vybe Invite</Text>
                                        <Text style={styles.label}>Search for a Place</Text>
                                        <GooglePlacesAutocomplete
                                            ref={googleRef}
                                            placeholder="Search for a location"
                                            onPress={(data, details = null) => {
                                                setSelectedPlace({
                                                    placeId: data?.place_id,
                                                    name: data?.structured_formatting?.main_text,
                                                });
                                            }}
                                            query={{
                                                key: google_key,
                                                language: 'en',
                                            }}
                                            styles={{
                                                container: {
                                                    flex: 0,
                                                    zIndex: 100,
                                                    marginBottom: 20,
                                                    paddingBottom: 0,
                                                },
                                                textInputContainer: {
                                                    width: '100%',
                                                    zIndex: 101,
                                                    marginBottom: 0,
                                                    paddingBottom: 0,
                                                    height: undefined,     // let textInput define height
                                                },
                                                textInput: {
                                                    backgroundColor: '#f5f5f5',
                                                    height: 50,
                                                    borderRadius: 5,
                                                    paddingHorizontal: 10,
                                                    borderWidth: 1,
                                                    borderColor: '#ccc',
                                                    fontSize: 16,
                                                    marginBottom: 0,       // no trailing gap from the input itself
                                                    paddingBottom: 0,
                                                },
                                                listView: {
                                                    position: 'absolute',
                                                    top: 52,               // just below the 50px input
                                                    left: 0,
                                                    right: 0,
                                                    zIndex: 999,
                                                    backgroundColor: '#fff',
                                                    borderRadius: 5,
                                                    elevation: 5,
                                                    maxHeight: 300,
                                                },
                                                poweredContainer: {
                                                    marginBottom: 0,
                                                    paddingBottom: 0,
                                                },
                                            }}
                                            fetchDetails
                                            {...googlePlacesDefaultProps}
                                        />
                                        <View style={styles.switchContainer}>
                                            <Text style={styles.label}>
                                                {isPublic ? 'Public Invite 🌍' : 'Private Invite 🔒'}
                                            </Text>
                                            <Switch
                                                value={isPublic}
                                                onValueChange={setIsPublic}
                                                trackColor={{ false: '#ccc', true: '#4cd137' }}
                                                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                                            />
                                        </View>
                                        <View style={styles.dateTimeInput}>
                                            <Text style={styles.label}>Select Date & Time</Text>
                                            <DateTimePicker
                                                value={dateTime || new Date()}
                                                mode="datetime"
                                                display="default"
                                                onChange={(event, selectedDate) => {
                                                    if (selectedDate) setDateTime(selectedDate);
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
                                            <Text style={styles.confirmText}>{isEditing ? 'Save Edit' : 'Send Invite'}</Text>
                                        </TouchableOpacity>
                                        <TagFriendsModal
                                            visible={showFriendsModal}
                                            onClose={() => setShowFriendsModal(false)}
                                            onSave={(selected) => {
                                                const ids = selected.map(friend => friend._id);
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
    title: {
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 20,
    },
    confirmButton: {
        backgroundColor: '#009999',
        padding: 14,
        borderRadius: 8,
        marginVertical: 16,
        alignItems: 'center',
    },
    confirmText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
        color: '#555',
    },
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
    noteContainer: {
        marginBottom: 16,
    },
    noteInput: {
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        fontSize: 15,
        backgroundColor: '#f9f9f9',
        textAlignVertical: 'top', // for Android to align text at the top
    },
});

export default InviteModal;
