import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    ScrollView,
    Alert,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
    ActivityIndicator,
} from "react-native";
import { useDispatch } from "react-redux";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import WhenSection from "./WhenSection";
import TimeSection from "./TimeSection";
import PhotosSection from "./PhotosSection";
import { createEvent, editEvent } from "../../../Slices/EventsSlice";
import { createPromotion, updatePromotion } from "../../../Slices/PromotionsSlice";
import { uploadReviewPhotos } from "../../../Slices/PhotosSlice";
import { normalizePhoto } from "../../../functions";
import { setHeaderTitle, clearHeaderTitle } from "../../../Slices/uiSlice";

/* -------------------------------------------------- */
/* Helpers                                            */
/* -------------------------------------------------- */
const toDate = (v, fallback = new Date()) => (v ? new Date(v) : fallback);

async function uploadSelectedPhotos(dispatch, placeId, selectedPhotos) {
    const newPhotos = selectedPhotos.filter(
        (p) => p?.uri?.startsWith("file:") && !p.photoKey
    );

    let uploaded = [];
    if (newPhotos.length) {
        const keys = await dispatch(
            uploadReviewPhotos({ placeId, files: newPhotos })
        ).unwrap();
        uploaded = keys.map((photoKey, i) => ({
            photoKey,
            description: newPhotos[i]?.description || "",
        }));
    }

    const existing = selectedPhotos
        .filter((p) => p.photoKey && !p.uri?.startsWith("file:"))
        .map((p) => ({
            photoKey: p.photoKey,
            description: p.description || "",
        }));

    return [...uploaded, ...existing];
}

export default function CreateEventOrPromoPage() {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const route = useRoute();

    // You can pass mode explicitly, or we infer from which object is present.
    const explicitMode = route.params?.mode; // "event" | "promotion"
    const incomingEvent = route.params?.event || null;
    const incomingPromo = route.params?.promotion || null;
    const mode = useMemo(() => {
        if (explicitMode) return explicitMode;
        if (incomingEvent) return "event";
        return "promotion";
    }, [explicitMode, incomingEvent]);

    const { businessId } = route.params || {};
    const onDone =
        route.params?.onDone ||
        route.params?.onEventCreated ||
        route.params?.onPromotionCreated ||
        null;

    const placeId = businessId;

    // Pick incoming record based on mode
    const incoming = mode === "event" ? incomingEvent : incomingPromo;

    // ---------- initial values ----------
    const initialTitle = incoming?.title || "";
    const initialDescription = incoming?.description || "";
    const initialRecurring = !!incoming?.recurring;
    const initialDays = Array.isArray(incoming?.recurringDays)
        ? incoming.recurringDays
        : [];
    const initialAllDay = incoming?.allDay ?? true;

    // Events: startDate/startTime/endTime are Date values.
    // Promotions: if your backend stored strings for times, you can still coerce to Date.
    const initialStartDate =
        mode === "event"
            ? toDate(incoming?.startDate)
            : toDate(incoming?.date); // promotions use `date` for single-day

    const initialStartTime = toDate(incoming?.startTime);
    const initialEndTime = toDate(incoming?.endTime);
    const initialPhotos = (incoming?.photos || []).map(normalizePhoto);

    // ---------- state ----------
    const [hydrated, setHydrated] = useState(!!incoming);
    const [title, setTitle] = useState(initialTitle);
    const [description, setDescription] = useState(initialDescription);
    const [isRecurring, setIsRecurring] = useState(initialRecurring);
    const [selectedDays, setSelectedDays] = useState(initialDays);
    const [allDay, setAllDay] = useState(initialAllDay);
    const [startDate, setStartDate] = useState(initialStartDate);
    const [startTime, setStartTime] = useState(initialStartTime);
    const [endTime, setEndTime] = useState(initialEndTime);
    const [selectedPhotos, setSelectedPhotos] = useState(initialPhotos);
    const [saving, setSaving] = useState(false);

    // Rehydrate only when the identity changes
    useEffect(() => {
        if (!incoming?._id) {
            setHydrated(true); // create mode
            return;
        }

        setTitle(incoming.title || "");
        setDescription(incoming.description || "");
        setIsRecurring(!!incoming.recurring);
        setSelectedDays(Array.isArray(incoming.recurringDays) ? incoming.recurringDays : []);
        setAllDay(incoming.allDay ?? true);

        if (mode === "event") {
            setStartDate(toDate(incoming.startDate));
        } else {
            setStartDate(toDate(incoming.date));
        }

        setStartTime(toDate(incoming.startTime));
        setEndTime(toDate(incoming.endTime));

        setSelectedPhotos((incoming.photos || []).map(normalizePhoto));
        setHydrated(true);
    }, [incoming?._id, mode]);

    useFocusEffect(
        useCallback(() => {
            const { mode, event, promotion } = route.params || {};
            const isEdit = !!(event?._id || promotion?._id);
            const title = isEdit
                ? (mode === 'event' ? 'Edit Event' : 'Edit Promo')
                : (mode === 'event' ? 'Create Event' : 'Create Promo');

            dispatch(setHeaderTitle(title));
            return () => dispatch(clearHeaderTitle());
        }, [route?.params])
    );

    const handleSubmit = async () => {
        if (!title?.trim() || !description?.trim()) {
            Alert.alert("Error", "Please fill in all fields.");
            return;
        }

        setSaving(true);

        let photos = [];
        try {
            photos = await uploadSelectedPhotos(dispatch, placeId, selectedPhotos);
        } catch (err) {
            console.error("Photo upload failed:", err);
            setSaving(false);
            Alert.alert("Error", "Failed to upload photos.");
            return;
        }

        try {
            if (mode === "event") {
                const payload = {
                    placeId,
                    title: title.trim(),
                    description: description.trim(),
                    photos,
                    allDay,
                    recurring: isRecurring,
                    recurringDays: isRecurring ? selectedDays : [],
                    startTime,
                    endTime,
                    startDate,
                };

                if (incoming?._id) {
                    await dispatch(
                        editEvent({ placeId, eventId: incoming._id, ...payload })
                    ).unwrap();
                    Alert.alert("Success", "Event updated successfully!");
                } else {
                    await dispatch(createEvent(payload)).unwrap();
                    Alert.alert("Success", "Event created successfully!");
                }
            } else {
                // promotion payload differences:
                // - single-day uses `date`
                const payload = {
                    placeId,
                    title: title.trim(),
                    description: description.trim(),
                    date: isRecurring ? null : startDate || null,
                    allDay,
                    startTime: allDay ? null : startTime,
                    endTime: allDay ? null : endTime,
                    recurring: isRecurring,
                    recurringDays: isRecurring ? selectedDays : [],
                    photos,
                };

                if (incoming?._id) {
                    await dispatch(
                        updatePromotion({ promotionId: incoming._id, updatedData: payload })
                    ).unwrap();
                    Alert.alert("Success", "Promotion updated successfully!");
                } else {
                    await dispatch(createPromotion(payload)).unwrap();
                    Alert.alert("Success", "Promotion created successfully!");
                }
            }

            navigation.goBack();
            onDone && onDone();
        } catch (error) {
            console.error("Save failed:", error);
            Alert.alert("Error", error?.message || "Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    if (!hydrated) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? -150 : 0}
            style={styles.container}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Title</Text>
                        <TextInput style={styles.input} value={title} onChangeText={setTitle} />
                        <Text style={styles.label}>Description</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={description}
                            onChangeText={setDescription}
                            multiline
                        />
                        <WhenSection
                            isRecurring={isRecurring}
                            setIsRecurring={setIsRecurring}
                            selectedDays={selectedDays}
                            setSelectedDays={setSelectedDays}
                            startDate={startDate}
                            setStartDate={setStartDate}
                        />
                        <TimeSection
                            allDay={allDay}
                            setAllDay={setAllDay}
                            startTime={startTime}
                            setStartTime={setStartTime}
                            endTime={endTime}
                            setEndTime={setEndTime}
                        />
                        <PhotosSection
                            initialPhotos={initialPhotos}
                            onChangeSelectedPhotos={setSelectedPhotos}
                            isPromotion={mode === "promotion"}
                        />
                        <TouchableOpacity
                            onPress={handleSubmit}
                            style={[styles.button, { backgroundColor: "#2196F3", opacity: saving ? 0.7 : 1 }]}
                            disabled={saving}
                        >
                            <Text style={styles.buttonText}>
                                {incoming?._id
                                    ? mode === "event"
                                        ? "Save Event"
                                        : "Save Promotion"
                                    : mode === "event"
                                        ? "Create Event"
                                        : "Create Promotion"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, marginTop: 120, marginBottom: 40 },
    content: { padding: 16 },
    inputGroup: { gap: 12 },
    label: { fontWeight: "600" },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        borderRadius: 10,
        backgroundColor: "#F5F5F5",
    },
    textArea: { height: 80, textAlignVertical: "top" },
    button: { backgroundColor: "#008080", padding: 12, borderRadius: 10, alignItems: "center" },
    buttonText: { color: "white", fontWeight: "bold" },
});
