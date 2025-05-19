import React, { useEffect, useState } from "react";
import {
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
    Keyboard,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { createPromotion, updatePromotion, selectLoading } from "../../Slices/PromotionsSlice";
import EditPhotosModal from "../Profile/EditPhotosModal";
import EditPhotoDetailsModal from "../Profile/EditPhotoDetailsModal";
import * as ImagePicker from "expo-image-picker";
import { normalizePhoto } from "../../functions";
import { uploadReviewPhotos } from "../../Slices/PhotosSlice";
import RecurringDaysModal from "./RecurringDaysModal";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation, useRoute } from "@react-navigation/native";

const CreatePromotionPage = () => {
    const dispatch = useDispatch();
    const loading = useSelector(selectLoading);
    const navigation = useNavigation();
    const route = useRoute();
    const { placeId, promotion, onPromotionCreated } = route.params;

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [selectedPhotos, setSelectedPhotos] = useState([]);
    const [editPhotosModalVisible, setEditPhotosModalVisible] = useState(false);
    const [previewPhoto, setPreviewPhoto] = useState(null);
    const [photoDetailsEditing, setPhotoDetailsEditing] = useState(false);
    const [photoList, setPhotoList] = useState([]);
    const [selectedDays, setSelectedDays] = useState([]);
    const [recurringDaysModalVisible, setRecurringDaysModalVisible] = useState(false);
    const [isSingleDay, setIsSingleDay] = useState(true);
    const [allDay, setAllDay] = useState(true);
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date());

    useEffect(() => {
        if (promotion) {
            setTitle(promotion.title || "");
            setDescription(promotion.description || "");
            setStartDate(promotion.startDate ? new Date(promotion.startDate) : new Date());
            setEndDate(promotion.endDate ? new Date(promotion.endDate) : new Date());
            setIsSingleDay(promotion.isSingleDay ?? true);
            setAllDay(promotion.allDay ?? true);
            setSelectedDays(promotion.recurringDays || []);

            const normalized = (promotion.photos || []).map(normalizePhoto);
            setSelectedPhotos(normalized);
            setPhotoList(normalized);

            if (promotion.startTime) {
                const [h, m] = promotion.startTime.split(":").map(Number);
                const time = new Date();
                time.setHours(h, m, 0, 0);
                setStartTime(time);
            }

            if (promotion.endTime) {
                const [h, m] = promotion.endTime.split(":").map(Number);
                const time = new Date();
                time.setHours(h, m, 0, 0);
                setEndTime(time);
            }
        }
    }, [promotion]);

    const handleSubmit = async () => {
        if (!title || !description || (isSingleDay && !startDate) || (!isSingleDay && (!startDate || !endDate))) {
            Alert.alert("Error", "Please fill in all required fields.");
            return;
        }

        let uploadedPhotos = [];
        try {
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
            recurring: !isSingleDay,
            recurringDays: !isSingleDay ? selectedDays : [],
            startTime: allDay ? null : formattedStartTime,
            endTime: allDay ? null : formattedEndTime,
            photos: uploadedPhotos,
        };

        try {
            if (promotion) {
                await dispatch(updatePromotion({ promotionId: promotion._id, updatedData: promotionData })).unwrap();
            } else {
                await dispatch(createPromotion(promotionData)).unwrap();
                Alert.alert("Success", "Promotion created successfully!");
            }
            onPromotionCreated?.();
            navigation.goBack();
        } catch (error) {
            Alert.alert("Error", error?.message || "Something went wrong.");
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <ScrollView contentContainerStyle={{ padding: 16, marginTop: 150, }}>
                    <Text style={styles.label}>Title</Text>
                    <TextInput style={styles.input} value={title} onChangeText={setTitle} />
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={description}
                        onChangeText={setDescription}
                        multiline
                    />
                    {!isSingleDay && (
                        <>
                            <View style={styles.toggleContainer}>
                                <Text style={[styles.label, { marginRight: 10 }]}>{isSingleDay ? "Date" : "Date Range"}</Text>
                                <DateTimePicker value={startDate} mode="date" onChange={(e, d) => setStartDate(d)} />
                                <DateTimePicker value={endDate} mode="date" onChange={(e, d) => setEndDate(d)} />
                            </View>

                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: '#ccc' }]}
                                onPress={() => setRecurringDaysModalVisible(true)}
                            >
                                <Text style={styles.buttonText}>Select Recurring Days (Optional)</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    <View style={styles.toggleRow}>
                        <View style={styles.toggleOption}>
                            <Text style={styles.label}>Single Day</Text>
                            <Switch
                                value={isSingleDay}
                                onValueChange={(value) => {
                                    setIsSingleDay(value);
                                }}
                            />
                        </View>
                        <View style={styles.toggleOption}>
                            <Text style={styles.label}>All Day</Text>
                            <Switch value={allDay} onValueChange={setAllDay} />
                        </View>
                    </View>
                    {!allDay && (
                        <View style={styles.dateInput}>
                            <View style={styles.timeRow}>
                                <Text>Start Time</Text>
                                <DateTimePicker value={startTime} mode="time" onChange={(e, t) => setStartTime(t)} />
                            </View>
                            <View style={[styles.timeRow, { marginTop: 10, }]}>
                                <Text>End Time</Text>
                                <DateTimePicker value={endTime} mode="time" onChange={(e, t) => setEndTime(t)} />
                            </View>
                        </View>
                    )}
                    {!isSingleDay && selectedDays.length > 0 && <Text style={styles.label}>Recurs every: {selectedDays.join(", ")}</Text>}
                    <ScrollView horizontal style={styles.photoRow}>
                        {photoList.map((photo, index) => (
                            <TouchableOpacity key={index} onPress={() => { setPreviewPhoto(photo); setPhotoDetailsEditing(true); }}>
                                <Image source={{ uri: photo.uri }} style={styles.photo} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={styles.button} onPress={async () => {
                        const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ImagePicker.MediaType,
                            allowsMultipleSelection: true,
                            quality: 1,
                        });
                        if (!result.canceled) {
                            const newFiles = result.assets.map(asset => ({ uri: asset.uri, name: asset.uri.split("/").pop(), type: asset.type || "image/jpeg", description: "", taggedUsers: [] }));
                            const combined = [...selectedPhotos, ...newFiles];
                            const uniquePhotos = [...new Map(combined.map(p => [p.uri, p])).values()];
                            setSelectedPhotos(uniquePhotos);
                            setPhotoList(uniquePhotos);
                            setEditPhotosModalVisible(true);
                        }
                    }}>
                        <Text style={styles.buttonText}>Add Promotional Photo</Text>
                    </TouchableOpacity>
                    {loading ? (
                        <ActivityIndicator size="large" color="#0000ff" />
                    ) : (
                        <TouchableOpacity style={styles.button} onPress={handleSubmit}>
                            <Text style={styles.buttonText}>{promotion ? "Update Promotion" : "Create Promotion"}</Text>
                        </TouchableOpacity>
                    )}

                    <EditPhotosModal
                        visible={editPhotosModalVisible}
                        photos={selectedPhotos}
                        onSave={(updated) => {
                            const combined = [...selectedPhotos, ...updated];
                            const uniquePhotos = [...new Map(combined.map(p => [p.uri || p.photoKey, p])).values()];
                            setSelectedPhotos(uniquePhotos);
                            setPhotoList(uniquePhotos);
                            setEditPhotosModalVisible(false);
                        }}
                        photoList={photoList}
                        setPhotoList={setPhotoList}
                        onClose={() => setEditPhotosModalVisible(false)}
                        isPromotion={true}
                    />

                    {previewPhoto && (
                        <EditPhotoDetailsModal
                            visible={photoDetailsEditing}
                            photo={previewPhoto}
                            onClose={() => setPhotoDetailsEditing(false)}
                            onSave={(updated) => setPhotoList(prev => prev.map(p => p.uri === updated.uri ? updated : p))}
                            setPhotoList={setPhotoList}
                            isPromotion={true}
                            setSelectedPhotos={setSelectedPhotos}
                        />
                    )}

                    <RecurringDaysModal
                        visible={recurringDaysModalVisible}
                        selectedDays={selectedDays}
                        onSave={(days) => { setSelectedDays(days); setRecurringDaysModalVisible(false); }}
                        onClose={() => setRecurringDaysModalVisible(false)}
                    />
                </ScrollView>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
};

export default CreatePromotionPage;

const styles = StyleSheet.create({
    modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 16, textAlign: "center" },
    input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 10, marginBottom: 12 },
    textArea: { height: 80, textAlignVertical: "top" },
    toggleRow: { flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start", marginVertical: 10 },
    toggleContainer: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', marginTop: 10, },
    toggleOption: { flexDirection: 'row', marginBottom: 10, alignItems: 'center', justifyContent: 'space-between', width: '50%' },
    dateInput: { flexDirection: "column", marginVertical: 12, width: '50%' },
    timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: "space-between" },
    photoRow: { flexDirection: "row", marginVertical: 10 },
    photo: { width: 80, height: 80, borderRadius: 10, marginRight: 10 },
    button: { backgroundColor: "#008080", padding: 12, borderRadius: 10, alignItems: "center", marginVertical: 10 },
    buttonText: { color: "white", fontWeight: "bold" },
    label: { fontWeight: 600, marginBottom: 5 }
});