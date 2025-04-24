import React, { useEffect, useState } from "react";
import {
    Modal,
    View,
    Animated,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Switch,
    ScrollView,
    Image,
    Keyboard,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import {
    createPromotion,
    updatePromotion,
    selectLoading,
} from "../../Slices/PromotionsSlice";
import { GestureHandlerRootView, PanGestureHandler } from "react-native-gesture-handler";
import EditPhotosModal from "../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../Profile/EditPhotoDetailsModal";
import * as ImagePicker from "expo-image-picker";
import { normalizePhoto } from "../../functions";
import { uploadReviewPhotos } from "../../Slices/PhotosSlice";
import RecurringDaysModal from "./RecurringDaysModal";
import DateTimePicker from "@react-native-community/datetimepicker";
import useSlideDownDismiss from "../../utils/useSlideDown";
import Notch from "../Notch/Notch";

const CreatePromotionModal = ({ visible, onClose, placeId, onPromotionCreated, promotion }) => {
    const dispatch = useDispatch();
    const loading = useSelector(selectLoading);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [selectedPhotos, setSelectedPhotos] = useState([]);
    const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
    const [previewPhoto, setPreviewPhoto] = useState(null);
    const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
    const [photoList, setPhotoList] = useState([]);
    const [isRecurring, setIsRecurring] = useState(false);
    const [selectedDays, setSelectedDays] = useState([]);
    const [recurringDaysModalVisible, setRecurringDaysModalVisible] = useState(false);
    const [isSingleDay, setIsSingleDay] = useState(true);
    const [allDay, setAllDay] = useState(true);
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date());

    const dateLabel = isSingleDay ? "Date" : "Valid";
    const { gestureTranslateY, animateIn, animateOut, onGestureEvent, onHandlerStateChange } = useSlideDownDismiss(onClose);

    useEffect(() => {
        if (selectedPhotos) setPhotoList(selectedPhotos);
    }, [selectedPhotos]);

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

    useEffect(() => {
        if (promotion) {
            setTitle(promotion.title || "");
            setDescription(promotion.description || "");
            setStartDate(promotion.startDate ? new Date(promotion.startDate) : new Date());
            setEndDate(promotion.endDate ? new Date(promotion.endDate) : new Date());
            setIsSingleDay(promotion.isSingleDay ?? true);
            setAllDay(promotion.allDay ?? true);
            setIsRecurring(promotion.recurring || false);
            setSelectedDays(promotion.recurringDays || []);

            const normalized = (promotion.photos || []).map(normalizePhoto);
            setSelectedPhotos(normalized);
            setPhotoList(normalized);

            // Parse time strings (e.g., "17:00") into Date objects
            if (promotion.startTime) {
                const [h, m] = promotion.startTime.split(":").map(Number);
                const time = new Date();
                time.setHours(h, m, 0, 0);
                setStartTime(time);
            } else {
                setStartTime(new Date(promotion.startDate || Date.now()));
            }

            if (promotion.endTime) {
                const [h, m] = promotion.endTime.split(":").map(Number);
                const time = new Date();
                time.setHours(h, m, 0, 0);
                setEndTime(time);
            } else {
                setEndTime(new Date(promotion.endDate || Date.now()));
            }
        } else {
            setTitle("");
            setDescription("");
            setStartDate(new Date());
            setEndDate(new Date());
            setIsSingleDay(true);
            setAllDay(true);
            setStartTime(new Date());
            setEndTime(new Date());
            setIsRecurring(false);
            setSelectedDays([]);
            setPhotoList([]);
        }
    }, [promotion, visible]);

    const handleSubmit = async () => {
        if (!title || !description || (!isRecurring && (!startDate || (!isSingleDay && !endDate)))) {
            Alert.alert("Error", "Please fill in all required fields.");
            return;
        }

        let uploadedPhotos = [];

        try {
            // Filter out only local photos with a valid `uri` that starts with "file:" and no existing photoKey
            const newPhotosToUpload = selectedPhotos.filter(
                (p) => p.uri && p.uri.startsWith("file:") && !p.photoKey
            );

            if (newPhotosToUpload.length > 0) {
                const uploadResult = await dispatch(
                    uploadReviewPhotos({ placeId, files: newPhotosToUpload })
                ).unwrap();

                uploadedPhotos = uploadResult.map((photoKey, index) => ({
                    photoKey,
                    uploadedBy: placeId,
                    description: newPhotosToUpload[index]?.description || "",
                }));
            }

            // Preserve existing uploaded photos
            const existingPhotos = selectedPhotos.filter((p) => p.photoKey);
            uploadedPhotos = [...uploadedPhotos, ...existingPhotos];
        } catch (error) {
            console.error("Photo upload failed:", error);
            Alert.alert("Error", "Failed to upload photos.");
            return;
        }

        const mergedStart = new Date(startDate);
        const mergedEnd = new Date(isSingleDay ? startDate : endDate);

        let formattedStartTime = null;
        let formattedEndTime = null;

        if (!allDay) {
            mergedStart.setHours(startTime.getHours(), startTime.getMinutes());
            mergedEnd.setHours(endTime.getHours(), endTime.getMinutes());

            formattedStartTime = `${startTime.getHours().toString().padStart(2, "0")}:${startTime.getMinutes().toString().padStart(2, "0")}`;
            formattedEndTime = `${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}`;
        }

        const promotionData = {
            placeId,
            title,
            description,
            startDate: mergedStart,
            endDate: mergedEnd,
            isSingleDay,
            allDay,
            recurring: isRecurring,
            recurringDays: isRecurring ? selectedDays : [],
            startTime: allDay ? null : formattedStartTime,
            endTime: allDay ? null : formattedEndTime,
            photos: uploadedPhotos,
        };

        try {
            if (promotion) {
                await dispatch(updatePromotion({ promotionId: promotion._id, updatedData: promotionData })).unwrap();
                setPhotoList([]);
            } else {
                await dispatch(createPromotion(promotionData)).unwrap();
                setPhotoList([]);
                Alert.alert("Success", "Promotion created successfully!");
            }

            onPromotionCreated();
            onClose();
        } catch (error) {
            Alert.alert("Error", error?.message || "Something went wrong.");
        }
    };

    const handleRecurringToggle = (value) => {
        setIsRecurring(value);

        if (value) {
            setRecurringDaysModalVisible(true);
            setStartDate(null);
            setEndDate(null);
        } else {
            const today = new Date();
            setStartDate(today);
            setEndDate(today);
        }
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <TouchableWithoutFeedback onPress={animateOut}>
                    <View style={styles.modalOverlay}>
                        <PanGestureHandler
                            onGestureEvent={onGestureEvent}
                            onHandlerStateChange={onHandlerStateChange}
                        >
                            <Animated.View style={[styles.modalContent, { transform: [{ translateY: gestureTranslateY }] }]}>
                                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                                    <KeyboardAvoidingView
                                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                                        keyboardVerticalOffset={Platform.OS === "ios" ? -150 : 0}
                                        style={styles.modalContainer}
                                    >
                                        <Text style={styles.modalTitle}>{promotion ? "Edit Promotion" : "Create New Promotion"}</Text>
                                        <View style={styles.inputContainer}>
                                            <Text style={styles.label}>Title</Text>
                                            <TextInput style={styles.input} value={title} onChangeText={setTitle} />
                                        </View>

                                        <View style={styles.inputContainer}>
                                            <Text style={styles.label}>Description</Text>
                                            <TextInput
                                                style={[styles.input, styles.textArea]}
                                                value={description}
                                                onChangeText={setDescription}
                                                multiline
                                            />
                                        </View>

                                        <View style={styles.toggleRow}>
                                            <View style={styles.toggleItem}>
                                                <Text style={styles.toggleLabel}>Single Day?</Text>
                                                <Switch value={isSingleDay} onValueChange={setIsSingleDay} trackColor={{ false: "#ccc", true: "#2196F3" }} />
                                            </View>

                                            <View style={styles.toggleItem}>
                                                <Text style={styles.toggleLabel}>All Day?</Text>
                                                <Switch value={allDay} onValueChange={setAllDay} trackColor={{ false: "#ccc", true: "#2196F3" }} />
                                            </View>

                                            <View style={styles.toggleItem}>
                                                <Text style={styles.toggleLabel}>Recurring</Text>
                                                <Switch
                                                    value={isRecurring}
                                                    trackColor={{ false: "#ccc", true: "#2196F3" }}
                                                    onValueChange={handleRecurringToggle}
                                                />
                                            </View>
                                        </View>

                                        {!isRecurring && (
                                            <View style={styles.toggleContainer}>
                                                <Text style={styles.toggleLabel}>{dateLabel}</Text>
                                                <DateTimePicker
                                                    value={startDate || new Date()}
                                                    mode="date"
                                                    display="default"
                                                    onChange={(e, d) => setStartDate(d)}
                                                />
                                                {!isSingleDay && (
                                                    <DateTimePicker
                                                        value={endDate || new Date()}
                                                        mode="date"
                                                        display="default"
                                                        onChange={(e, d) => setEndDate(d)}
                                                    />
                                                )}
                                            </View>
                                        )}

                                        {!allDay && (
                                            <>
                                                <View style={styles.dateInput}>
                                                    <View>
                                                        <Text style={styles.dateLabel}>Start Time</Text>
                                                        <DateTimePicker value={startTime} mode="time" display="default" onChange={(e, t) => { setStartTime(t); }} />
                                                    </View>
                                                    <View>
                                                        <Text style={styles.dateLabel}>End Time</Text>
                                                        <DateTimePicker value={endTime} mode="time" display="default" onChange={(e, t) => { setEndTime(t); }} />
                                                    </View>
                                                </View>
                                            </>
                                        )}

                                        {isRecurring && (
                                            <Text style={styles.selectedDaysText}>Recurs every: {selectedDays.join(", ")}</Text>
                                        )}

                                        <ScrollView horizontal style={styles.photoContainer}>
                                            {photoList.map((photo, index) => (
                                                <TouchableOpacity key={index} onPress={() => { setPreviewPhoto(photo); setPhotoDetailsEditing(true); }}>
                                                    <Image source={{ uri: photo.uri }} style={styles.imagePreview} />
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>

                                        <TouchableOpacity style={styles.uploadButton} onPress={async () => {
                                            const result = await ImagePicker.launchImageLibraryAsync({
                                                mediaTypes: ImagePicker.MediaType,
                                                allowsMultipleSelection: true,
                                                quality: 1,
                                            });

                                            if (!result.canceled) {
                                                const newFiles = result.assets.map((asset) => ({
                                                    uri: asset.uri,
                                                    name: asset.uri.split("/").pop(),
                                                    type: asset.type || "image/jpeg",
                                                    description: "",
                                                    taggedUsers: [],
                                                }));

                                                const combined = [...selectedPhotos, ...newFiles];
                                                const uniquePhotos = [...new Map(combined.map(p => [p.uri, p])).values()];

                                                setSelectedPhotos(uniquePhotos);
                                                setPhotoList(uniquePhotos); // ✅ ensures full set is sent to EditPhotosModal
                                                setEditPhotosModalVisible(true);
                                            }
                                        }}>
                                            <Text style={styles.uploadButtonText}>Add Promotional Photo</Text>
                                        </TouchableOpacity>

                                        {loading ? (
                                            <ActivityIndicator size="large" color="#0000ff" />
                                        ) : (
                                            <TouchableOpacity style={styles.saveButton} onPress={handleSubmit}>
                                                <Text style={styles.saveButtonText}>{promotion ? "Update Promotion" : "Create Promotion"}</Text>
                                            </TouchableOpacity>
                                        )}
                                    </KeyboardAvoidingView>
                                </TouchableWithoutFeedback>
                            </Animated.View>
                        </PanGestureHandler>
                    </View>
                </TouchableWithoutFeedback>

                <EditPhotosModal
                    visible={editPhotosModalVisible}
                    photos={selectedPhotos}
                    onSave={(updated) => {
                        const existingUris = new Set(selectedPhotos.map(p => p.uri || p.photoKey));
                        const newPhotosOnly = updated.filter(p => !existingUris.has(p.uri || p.photoKey));
                        const combined = [...selectedPhotos, ...newPhotosOnly];

                        const uniquePhotos = [...new Map(combined.map(p => [p.uri || p.photoKey, p])).values()];

                        setSelectedPhotos(uniquePhotos);     // ✅ used in handleSubmit()
                        setPhotoList(uniquePhotos);          // ✅ used in the preview grid
                        setEditPhotosModalVisible(false);
                    }}
                    photoList={photoList}
                    setPhotoList={setPhotoList}
                    onClose={() => setEditPhotosModalVisible(false)}
                    isPromotion={true} />

                <EditPhotoDetailsModal
                    visible={photoDetailsEditing}
                    photo={previewPhoto}
                    onClose={() => setPhotoDetailsEditing(false)}
                    onSave={(updated) => setPhotoList(prev => prev.map(p => p.uri === updated.uri ? updated : p))}
                    setPhotoList={setPhotoList} isPromotion={true}
                    setSelectedPhotos={setSelectedPhotos}
                />

                <RecurringDaysModal visible={recurringDaysModalVisible} selectedDays={selectedDays} onSave={(days) => { setSelectedDays(days); setRecurringDaysModalVisible(false); }} onClose={() => { setRecurringDaysModalVisible(false); if (selectedDays.length === 0) setIsRecurring(false); }} />
            </GestureHandlerRootView>
        </Modal>
    );
};

export default CreatePromotionModal;

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    modalContainer: {
        width: "100%",
    },
    modalContent: {
        width: "100%",
        backgroundColor: "white",
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        alignItems: "flex-start",
        flexDirection: "column",
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 10,
        alignSelf: "center",
    },
    inputContainer: {
        width: "100%",
        marginBottom: 12,
        flexDirection: "column",
    },
    input: {
        width: "100%",
        padding: 10,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 10,
        backgroundColor: "#F5F5F5",
    },
    textArea: {
        height: 80,
        textAlignVertical: "top",
    },
    toggleContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#F5F5F5",
        padding: 12,
        borderRadius: 10,
        marginVertical: 10,
        width: "100%",
    },
    toggleLabel: {
        fontSize: 16,
        fontWeight: "600",
        color: "#333",
    },
    dateInput: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-around",
        width: "100%",
        padding: 8,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 10,
        backgroundColor: "#F5F5F5",
        marginBottom: 5,
    },
    dateLabel: {
        fontWeight: 'bold',
        alignSelf: 'center'
    },
    dateText: {
        fontSize: 16,
        color: "#000",
        fontWeight: "500",
        marginTop: 4,
    },
    selectedDaysText: {
        marginTop: 8,
        fontSize: 14,
        fontWeight: "500",
        color: "#333",
        textAlign: "left",
        width: "100%",
    },
    uploadButton: {
        backgroundColor: "#008080",
        padding: 12,
        borderRadius: 10,
        alignItems: "center",
        marginBottom: 10,
        width: "100%",
    },
    uploadButtonText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 16,
    },
    photoContainer: {
        marginVertical: 10,
        flexDirection: "row",
        width: "100%",
    },
    imagePreview: {
        width: 80,
        height: 80,
        borderRadius: 10,
        marginRight: 10,
    },
    saveButton: {
        backgroundColor: "#2196F3",
        padding: 15,
        borderRadius: 10,
        alignItems: "center",
        width: "100%",
        marginVertical: 10,
    },
    saveButtonText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 16,
    },
    dateLabel: {
        fontWeight: 'bold',
        alignSelf: 'center'
    },
    toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        padding: 12,
        borderRadius: 10,
        marginVertical: 10,
        width: '100%',
        flexWrap: 'wrap', // in case screen is small
    },
    toggleItem: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        paddingHorizontal: 5,
    },
});

