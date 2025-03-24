import React, { useEffect, useState } from "react";
import {
    Modal,
    View,
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
import { uploadReviewPhotos } from "../../Slices/PhotosSlice";
import RecurringDaysModal from "./RecurringDaysModal";
import DateTimePicker from "@react-native-community/datetimepicker";

const CreatePromotionModal = ({ visible, onClose, placeId, onPromotionCreated, promotion }) => {
    const dispatch = useDispatch();
    const loading = useSelector(selectLoading);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [selectedPhotos, setSelectedPhotos] = useState([]);
    const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
    const [previewPhoto, setPreviewPhoto] = useState(null);
    const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
    const [photoList, setPhotoList] = useState([]);
    const [isRecurring, setIsRecurring] = useState(false);
    const [selectedDays, setSelectedDays] = useState([]);
    const [recurringDaysModalVisible, setRecurringDaysModalVisible] = useState(false);

    useEffect(() => {
        if (selectedPhotos) {
            setPhotoList(selectedPhotos);
        }
    }, [selectedPhotos]);

    useEffect(() => {
        if (promotion) {
            setTitle(promotion.title || "");
            setDescription(promotion.description || "");
            setStartDate(promotion.startDate ? new Date(promotion.startDate) : new Date());
            setEndDate(promotion.endDate ? new Date(promotion.endDate) : new Date());
    
            // Set the recurring state correctly if editing an existing promotion
            setIsRecurring(promotion.recurring || false);
            setSelectedDays(promotion.recurringDays || []);
        } else {
            setTitle("");
            setDescription("");
            setStartDate(new Date());
            setEndDate(new Date());
            setIsRecurring(false);
            setSelectedDays([]);
        }
    }, [promotion, visible]);    

    const onStartDateChange = (event, selectedDate) => {
        if (selectedDate) {
            setStartDate(selectedDate);
        }
        setShowStartPicker(false);
    };

    const onEndDateChange = (event, selectedDate) => {
        if (selectedDate) {
            setEndDate(selectedDate);
        }
        setShowEndPicker(false);
    };

    const handlePhotoAlbumSelection = async () => {
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

            setSelectedPhotos((prevPhotos) => [...prevPhotos, ...newFiles]);
            setEditPhotosModalVisible(true);
        }
    };

    const handleSavePhotos = (updatedPhotos) => {
        setSelectedPhotos(updatedPhotos);
        setEditPhotosModalVisible(false);
    };

    const handlePhotoSave = (updatedPhoto) => {
        setPhotoList((prev) =>
            prev.map((photo) => (photo.uri === updatedPhoto.uri ? updatedPhoto : photo))
        );
    };

    const handlePreviewImagePress = (photo) => {
        setPreviewPhoto(photo);
        setPhotoDetailsEditing(true);
    };

    // Open the Recurring Days Modal
    const handleRecurringToggle = (value) => {
        setIsRecurring(value);
        if (value) {
            setRecurringDaysModalVisible(true);
        }
    };

    // Save Recurring Days
    const handleSaveRecurringDays = (days) => {
        setSelectedDays(days);
        setRecurringDaysModalVisible(false);
    };

    const handleSubmit = async () => {
        if (!title || !description || !startDate || !endDate) {
            Alert.alert("Error", "Please fill in all required fields.");
            return;
        }

        let uploadedPhotos = [];

        // Upload photos if user selected any
        try {
            if (selectedPhotos.length > 0) {
                const uploadResult = await dispatch(uploadReviewPhotos({ placeId, files: selectedPhotos })).unwrap();
                uploadedPhotos = uploadResult.map((photoKey, index) => ({
                    photoKey,
                    uploadedBy: placeId,
                    description: selectedPhotos[index]?.description || "",
                }));
            }
        } catch (error) {
            console.error("Photo upload failed:", error);
            Alert.alert("Error", "Failed to upload photos.");
            return;
        }

        const promotionData = {
            placeId,
            title,
            description,
            startDate,
            endDate,
            photos: uploadedPhotos,
            recurring: isRecurring,
            recurringDays: selectedDays,
        };

        try {
            if (promotion) {
                await dispatch(updatePromotion({ promotionId: promotion._id, updatedData: promotionData })).unwrap();
            } else {
                await dispatch(createPromotion(promotionData)).unwrap();
            }

            onPromotionCreated();
            onClose();
        } catch (error) {
            Alert.alert("Error", error || "Something went wrong.");
        }
    };

    const handleCloseRecurringModal = () => {
        setRecurringDaysModalVisible(false);
    
        if (selectedDays.length === 0) {
            setIsRecurring(false); // Reset recurring toggle if no days are selected
        }
    };
    
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView
                            behavior={Platform.OS === "ios" ? "padding" : "height"}
                            keyboardVerticalOffset={Platform.OS === "ios" ? -150 : 0}
                            style={styles.modalContainer}
                        >
                            <PanGestureHandler
                                onGestureEvent={(event) => {
                                    if (event.nativeEvent.translationY > 50) {
                                        onClose();
                                    }
                                }}
                            >
                                <View style={styles.modalContent}>
                                    <TouchableWithoutFeedback onPress={() => { }}>
                                        <View style={{ width: "100%" }}>
                                            {/* Swipe-down notch */}
                                            <View style={styles.notchContainer}>
                                                <View style={styles.notch} />
                                            </View>

                                            <Text style={styles.modalTitle}>
                                                {promotion ? "Edit Promotion" : "Create New Promotion"}
                                            </Text>

                                            <View style={styles.inputContainer}>
                                                <Text style={styles.label}>Title</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={title}
                                                    onChangeText={setTitle}
                                                />
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

                                            <View style={styles.dateInput}>
                                                <Text style={styles.label}>Start Date</Text>
                                                <DateTimePicker
                                                    value={startDate || new Date()}
                                                    mode="date"
                                                    display="default"
                                                    onChange={onStartDateChange}
                                                />                    
                                            </View>

                                            <View style={styles.dateInput}>
                                                <Text style={styles.label}>End Date</Text>
                                                <DateTimePicker
                                                    value={endDate || new Date()}
                                                    mode="date"
                                                    display="default"
                                                    onChange={onEndDateChange}
                                                />                    
                                            </View>

                                            <View style={styles.toggleContainer}>
                                                <Text style={styles.toggleLabel}>Make Recurring</Text>
                                                <Switch
                                                    value={isRecurring}
                                                    onValueChange={handleRecurringToggle}
                                                    thumbColor={isRecurring ? "#FFFFFF" : "#f4f3f4"}
                                                    trackColor={{ false: "#ccc", true: "#4CAF50" }} // Gray when OFF, Green when ON
                                                />
                                            </View>

                                            {isRecurring && (
                                                <Text style={styles.selectedDaysText}>Repeats on: {selectedDays.join(", ")}</Text>
                                            )}

                                            {/* Render photo previews */}
                                            <ScrollView horizontal style={styles.photoContainer}>
                                                {photoList.map((photo, index) => (
                                                    <TouchableOpacity key={index} onPress={() => handlePreviewImagePress(photo)}>
                                                        <Image source={{ uri: photo.uri }} style={styles.imagePreview} />
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>

                                            {/* Promotional Photo Upload */}
                                            <TouchableOpacity style={styles.uploadButton} onPress={handlePhotoAlbumSelection}>
                                                <Text style={styles.uploadButtonText}>Add Promotional Photo</Text>
                                            </TouchableOpacity>
                                            {loading ? (
                                                <ActivityIndicator size="large" color="#0000ff" />
                                            ) : (
                                                <TouchableOpacity style={styles.saveButton} onPress={handleSubmit}>
                                                    <Text style={styles.saveButtonText}>
                                                        {promotion ? "Update Promotion" : "Create Promotion"}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </TouchableWithoutFeedback>
                                </View>
                            </PanGestureHandler>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </GestureHandlerRootView>

            {/* Edit photos modal */}
            <EditPhotosModal
                visible={editPhotosModalVisible}
                photos={selectedPhotos}
                onSave={handleSavePhotos}
                photoList={photoList}
                setPhotoList={setPhotoList}
                onClose={() => {
                    setEditPhotosModalVisible(false);
                }}
                isPromotion={true}
            />

            {/* Edit Photo Details Modal */}
            <EditPhotoDetailsModal
                visible={photoDetailsEditing}
                photo={previewPhoto}
                onClose={() => setPhotoDetailsEditing(false)}
                onSave={handlePhotoSave}
                setPhotoList={setPhotoList}
                isPromotion={true}
            />

            <RecurringDaysModal
                visible={recurringDaysModalVisible}
                selectedDays={selectedDays}
                onSave={handleSaveRecurringDays}
                onClose={handleCloseRecurringModal}
            />
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
        width: "100%",  // Fixed: Ensures full-width layout
        backgroundColor: "white",
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        alignItems: "center",
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
    },
    notchContainer: {
        width: "100%",
        alignItems: "center",
        paddingVertical: 10,
    },
    notch: {
        width: 40,
        height: 5,
        borderRadius: 3,
        backgroundColor: "#ccc",
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 15,
        alignSelf: 'center',
    },
    inputContainer: {
        width: "100%",
        marginBottom: 12,
    },
    dateInput: {
        width: '100%',
        marginBottom: 12
    },
    label: {
        fontSize: 14,
        fontWeight: "bold",
        marginBottom: 4,
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
    uploadButton: {
        backgroundColor: "#FFA500",
        padding: 12,
        borderRadius: 10,
        alignItems: "center",
        marginBottom: 10,
    },
    uploadButtonText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 16,
    },
    photoContainer: {
        marginVertical: 10,
        flexDirection: "row",
    },
    imagePreview: {
        width: 80,
        height: 80,
        borderRadius: 10,
        marginRight: 10,
    },
    toggleContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#F5F5F5",
        padding: 12,
        borderRadius: 10,
        marginVertical: 10,
    },
    toggleLabel: {
        fontSize: 16,
        fontWeight: "600",
        color: "#333",
    },
    selectedDaysText: {
        marginTop: 8,
        fontSize: 14,
        fontWeight: "500",
        color: "#333",
        textAlign: "left",
    },
    dateInput: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: 8,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 10,
        backgroundColor: "#F5F5F5",
        marginBottom: 10,
    },
    dateText: {
        fontSize: 16,
        color: "#000",
        fontWeight: '500'
    },
});
