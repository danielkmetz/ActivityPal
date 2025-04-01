import React, { useState, useRef, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Switch,
    Animated,
    Keyboard,
    ScrollView,
} from 'react-native';
import TagFriendsModal from '../Reviews/TagFriendsModal';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSelector, useDispatch } from 'react-redux';
import { sendInvite, editInvite } from '../../Slices/InvitesSlice';
import { selectUser } from '../../Slices/UserSlice';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

//Will need to add logic to handle uninvited people

const google_key = process.env.EXPO_PUBLIC_GOOGLE_KEY;

const SCREEN_HEIGHT = Dimensions.get('window').height;

const InviteModal = ({
    visible,
    onClose,
    friends = [],
    setShowInviteModal,
    isEditing,
    initialInvite,
}) => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [dateTime, setDateTime] = useState(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedFriends, setSelectedFriends] = useState([]);
    const [isPublic, setIsPublic] = useState(true);
    const [note, setNote] = useState('');

    const translateY = useRef(new Animated.Value(0)).current;
    const gestureThreshold = 100;
    const googleRef = useRef(null);

    useEffect(() => {
        if (isEditing && initialInvite) {
            const { business } = initialInvite;

            if (business) {
                const formattedPlace = {
                    placeId: business.placeId,
                    name: business.businessName,
                };
                setSelectedPlace(formattedPlace);

                // 👇 This sets the visible text input
                googleRef.current?.setAddressText(business.businessName);
            }

            setNote(initialInvite.note || '');
            setDateTime(new Date(initialInvite.dateTime));
            setSelectedFriends(initialInvite.recipients?.map(r => r.userId) || []);
        }
    }, [isEditing, initialInvite]);

    useEffect(() => {
        if (!visible) {
            translateY.setValue(0); // Reset immediately
        }
    }, [visible]);

    const onGestureEvent = Animated.event(
        [{ nativeEvent: { translationY: translateY } }],
        {
            useNativeDriver: false,
            listener: (event) => {
                const { translationY } = event.nativeEvent;

                // Prevent dragging up — only allow positive Y movement
                if (translationY < 0) {
                    translateY.setValue(0);
                }
            },
        }
    );

    const onHandlerStateChange = ({ nativeEvent }) => {
        if (nativeEvent.state === State.END) {
            if (nativeEvent.translationY > gestureThreshold) {
                onClose(); // close the modal
            } else {
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: false,
                }).start();
            }
        }
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.overlay}>
                        <KeyboardAvoidingView
                            behavior={Platform.OS === 'ios' ? 'position' : 'height'}
                            keyboardVerticalOffset={-80}
                            style={styles.keyboardAvoiding}
                        >
                            <PanGestureHandler
                                onGestureEvent={onGestureEvent}
                                onHandlerStateChange={onHandlerStateChange}
                            >
                                <Animated.View style={[styles.modalContainer, { transform: [{ translateY }] }]}>
                                    {/* Top draggable notch */}
                                    <View style={styles.notchContainer}>
                                        <View style={styles.notch} />
                                    </View>

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
                                            container: { zIndex: 100 },
                                            textInputContainer: {
                                                width: "100%",
                                                zIndex: 101,
                                            },
                                            textInput: {
                                                backgroundColor: "#f5f5f5",
                                                height: 50,
                                                borderRadius: 5,
                                                paddingHorizontal: 10,
                                                borderWidth: 1,
                                                borderColor: "#ccc",
                                                fontSize: 16,
                                            },
                                            listView: {
                                                position: 'absolute',
                                                top: 60, // Push it just below the textInput
                                                zIndex: 999,
                                                backgroundColor: "#fff",
                                                borderRadius: 5,
                                                elevation: 5,
                                                maxHeight: 300,
                                            },
                                        }}
                                        fetchDetails
                                    />
                                    <View style={styles.dateTimeInput}>
                                        <Text style={styles.label}>Select Date & Time</Text>
                                        <DateTimePicker
                                            value={dateTime || new Date()}
                                            mode="datetime"
                                            display="default"
                                            onChange={(event, selectedDate) => {
                                                setShowDatePicker(false);
                                                if (selectedDate) setDateTime(selectedDate);
                                            }}
                                        />
                                    </View>

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

                                    <TouchableOpacity
                                        style={styles.selectFriendsButton}
                                        onPress={() => setShowFriendsModal(true)}
                                    >
                                        <Text style={styles.selectFriendsText}>
                                            {selectedFriends.length > 0
                                                ? `👥 ${selectedFriends.length} Friend${selectedFriends.length > 1 ? 's' : ''} Selected`
                                                : '➕ Select Friends'}
                                        </Text>
                                    </TouchableOpacity>

                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.selectedFriendsPreview}
                                    >
                                        {friends
                                            .filter((friend) => selectedFriends.includes(friend._id))
                                            .map((friend) => (
                                                <TouchableOpacity
                                                    key={friend._id}
                                                    style={styles.friendPreview}
                                                    onPress={() =>
                                                        setSelectedFriends((prev) =>
                                                            prev.filter((id) => id !== friend._id)
                                                        )
                                                    }
                                                >
                                                    <Image
                                                        source={
                                                            friend.presignedProfileUrl
                                                                ? { uri: friend.presignedProfileUrl }
                                                                : require('../../assets/pics/profile-pic-placeholder.jpg')
                                                        }
                                                        style={styles.profilePic}
                                                    />
                                                    <Text style={styles.friendName}>
                                                        {friend.firstName}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                    </ScrollView>

                                    <TouchableOpacity
                                        style={styles.confirmButton}
                                        onPress={async () => {
                                            if (!selectedPlace || !dateTime || selectedFriends.length === 0) {
                                                alert('Please complete all invite details.');
                                                return;
                                            }

                                            const invitePayload = {
                                                senderId: user.id,
                                                recipientIds: selectedFriends,
                                                placeId: selectedPlace.placeId,
                                                dateTime,
                                                message: '',
                                                note,
                                                isPublic,
                                            };

                                            try {
                                                if (isEditing && initialInvite) {
                                                    const updates = {
                                                        placeId: selectedPlace.placeId,
                                                        dateTime,
                                                        note,
                                                        isPublic,
                                                    };

                                                    await dispatch(editInvite({
                                                        recipientId: user.id,
                                                        inviteId: initialInvite._id,
                                                        updates,
                                                        recipientIds: selectedFriends,
                                                    }));
                                                    alert('Invite updated!');
                                                } else {
                                                    await dispatch(sendInvite(invitePayload));
                                                    alert('Invite sent!');
                                                }

                                                // Reset state
                                                setSelectedFriends([]);
                                                setNote(null);
                                                setSelectedPlace(null);
                                                setDateTime(null);
                                                setShowInviteModal(false);
                                                onClose();

                                            } catch (err) {
                                                console.error('Failed to send invite:', err);
                                                alert('Something went wrong. Please try again.');
                                            }
                                        }}
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
                                </Animated.View>
                            </PanGestureHandler>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: '#00000088',
    },
    modalContainer: {
        width: '100%',
        height: SCREEN_HEIGHT * 0.70,
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
        alignSelf: 'flex-end', // anchor it to the bottom
        //flexShrink: 1,
    },
    notchContainer: {
        alignItems: 'center',
        marginBottom: 10,
    },
    notch: {
        width: 40,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#ccc',
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 20,
    },
    subtitle: {
        fontSize: 14,
        color: '#555',
        marginBottom: 12,
    },
    list: {
        flexGrow: 0,
        maxHeight: 250,
    },
    friendItem: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    friendText: {
        fontSize: 16,
    },
    selected: {
        backgroundColor: '#e6f0ff',
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
    placesInput: {
        height: 44,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        fontSize: 16,
        backgroundColor: '#f9f9f9',
        marginBottom: 10,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
        color: '#555',
    },
    dateButton: {
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#f1f1f1',
        marginBottom: 12,
        alignItems: 'center',
    },
    dateText: {
        fontSize: 16,
        color: '#333',
    },
    selectedPlace: {
        fontSize: 16,
        color: '#333',
        marginBottom: 10,
        fontWeight: '500',
    },
    selectFriendsButton: {
        backgroundColor: '#33cccc',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 12,
    },
    selectFriendsText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '500',
    },
    list: {
        maxHeight: 200,
        backgroundColor: '#f9f9f9',
        borderRadius: 8,
        marginBottom: 16,
        paddingHorizontal: 10,
    },
    friendItem: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
    },
    friendText: {
        fontSize: 15,
        color: '#333',
    },
    selectedFriendsPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 2,
    },
    friendPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e6f0ff',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 20,
        marginRight: 8,
        marginBottom: 8,
    },
    profilePic: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginRight: 6,
    },
    friendName: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
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
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'flex-end',
    },
    switchContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
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
