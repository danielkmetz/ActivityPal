import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Modal, ActivityIndicator, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import { useSelector, useDispatch } from "react-redux";
import { selectCoordinates } from "../../Slices/LocationSlice";
import { setDistance, setBudget, setIsFamilyFriendly, selectDistance, selectBudget, selectFamilyFriendly } from "../../Slices/PreferencesSlice";
import { closePreferences, selectViewPreferences } from "../../Slices/PlacesSlice";
import { milesToMeters } from "../../functions";
import useSlideDownDismiss from "../../utils/useSlideDown";
import WheelPicker from "../CustomePicker/CustomPicker";
import Notch from "../Notch/Notch";
import styles from "./PrefModalStyles";
import { computeTargetAt } from "../../utils/Activities/whenMoment";
import { MODE_OPTIONS, DEFAULT_WHEN_TIME_HHMM, PLACE_CATEGORY_OPTIONS, EVENT_CATEGORY_OPTIONS, WHEN_OPTIONS, WHO_OPTIONS, VIBE_OPTIONS } from "./PreferencesModalConstants";
import { SearchSection, ContextSection, AdvancedToggleSection, PlacesFiltersSection, EventFiltersSection, FooterSection } from "./Sections";

// ----------------------
// Helpers
// ----------------------
function getLabel(options, value, fallback = null) {
    const safe = Array.isArray(options) ? options : [];
    const hit = safe.find((o) => o.value === value);
    return hit ? hit.label : fallback;
}

function setIn(obj, path, value) {
    const keys = String(path).split(".");
    const out = { ...obj };
    let cur = out;

    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        cur[k] = { ...(cur[k] || {}) };
        cur = cur[k];
    }

    cur[keys[keys.length - 1]] = value;
    return out;
}

const DEFAULT_DRAFT = {
    mode: "places", // places | events | mixed
    placeCategory: "any",
    eventCategory: "any",
    when: "any",
    customWhen: null,
    who: "any",
    vibes: [], // up to 2
    keyword: "",
    showAdvanced: false,
    places: {
        openNowOnly: false,
        minRatingEnabled: false,
        minRating: 4.0,
        outdoorSeating: false,
        liveMusic: false,
        reservable: false,
        dogFriendly: false,
        avoid: {
            chains: false,
            fastFood: false,
            bars: false,
        },
    },
    events: {
        freeOnly: false,
        sort: "date", // date | distance | relevance
    },
};

function countActiveAdvanced(draft, showPlaces, showEvents) {
    let n = 0;

    if (showPlaces) {
        if (draft.places.openNowOnly) n++;
        if (draft.places.minRatingEnabled) n++;
        if (draft.places.outdoorSeating) n++;
        if (draft.places.liveMusic) n++;
        if (draft.places.reservable) n++;
        if (draft.places.dogFriendly) n++;
        if (draft.places.avoid.chains) n++;
        if (draft.places.avoid.fastFood) n++;
        if (draft.places.avoid.bars) n++;
    }

    if (showEvents) {
        if (draft.events.freeOnly) n++;
        if (draft.events.sort && draft.events.sort !== "date") n++; // "date" is default
    }

    return n;
}

// ----------------------
// Component
// ----------------------
export default function PreferencesModal({ onSubmitCustomSearch }) {
    const dispatch = useDispatch();
    const distance = useSelector(selectDistance);
    const budget = useSelector(selectBudget); // allow null = Any
    const isFamilyFriendly = useSelector(selectFamilyFriendly);
    const visible = useSelector(selectViewPreferences);
    const coordinates = useSelector(selectCoordinates);
    const lat = coordinates?.lat;
    const lng = coordinates?.lng;
    const radius = milesToMeters(distance);

    // Local draft state
    const [draft, setDraft] = useState(DEFAULT_DRAFT);

    // Single picker controller
    const [activePicker, setActivePicker] = useState(null); // "placeCategory" | "eventCategory" | null

    const showPlaces = draft.mode === "places" || draft.mode === "mixed";
    const showEvents = draft.mode === "events" || draft.mode === "mixed";

    // Budget applies only to Food & Drink, but is NEVER required.
    const budgetApplies = showPlaces && draft.placeCategory === "food_drink";

    // Only real blocker is location
    const canSubmit = !!lat && !!lng && !!radius && !!draft.mode;

    const requestClose = useCallback(() => {
        setActivePicker(null);
        dispatch(closePreferences());
    }, [dispatch]);

    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(requestClose);

    useEffect(() => {
        if (visible) animateIn();
    }, [visible]);

    const setDraftField = useCallback((path, value) => {
        setDraft((prev) => setIn(prev, path, value));
    }, []);

    const toggleVibe = useCallback((val) => {
        setDraft((prev) => {
            const cur = Array.isArray(prev.vibes) ? prev.vibes : [];
            const has = cur.includes(val);
            if (has) return { ...prev, vibes: cur.filter((v) => v !== val) };
            if (cur.length >= 2) return { ...prev, vibes: [cur[1], val] };
            return { ...prev, vibes: [...cur, val] };
        });
    }, []);

    const closeModal = useCallback(() => {
        setActivePicker(null);
        animateOut();
    }, [animateOut]);

    const reset = useCallback(() => {
        // redux
        dispatch(setDistance(10));
        dispatch(setBudget(null));
        dispatch(setIsFamilyFriendly(false));

        // local
        setActivePicker(null);
        setDraft(DEFAULT_DRAFT);
    }, [dispatch]);

    const handleSubmit = useCallback(() => {
        if (!canSubmit) {
            console.log("[PreferencesModal][submit] blocked: canSubmit=false", {
                canSubmit,
                draftMode: draft?.mode,
            });
            return;
        }

        const trimmedKeyword = String(draft.keyword || "").trim();
        const placeCategory = draft.placeCategory === "any" ? null : draft.placeCategory;
        const eventCategory = draft.eventCategory === "any" ? null : draft.eventCategory;

        const whenPreset = draft.when === "any" ? null : draft.when;

        const customWhen =
            whenPreset === "custom"
                ? (draft.customWhen || null)
                : null;

        const whenAt = computeTargetAt({
            when: whenPreset,
            customWhen,
            defaultHHmm: DEFAULT_WHEN_TIME_HHMM,
        });

        const whenAtISO = whenAt instanceof Date && !isNaN(whenAt.getTime())
            ? whenAt.toISOString()
            : null;

        const payload = {
            radius,

            // Optional fields: send null if user didn’t care.
            when: whenPreset,
            customWhen,
            whenAtISO,

            who: draft.who === "any" ? null : draft.who,
            vibes: draft.vibes.length ? draft.vibes : null,
            keyword: trimmedKeyword ? trimmedKeyword : null,
            familyFriendly: !!isFamilyFriendly,

            mode: draft.mode,
            placeCategory,
            eventCategory,

            // Budget optional
            budget: budgetApplies ? (budget || null) : null,

            placesFilters: showPlaces
                ? {
                    openNowOnly: whenPreset === "now" ? !!draft.places.openNowOnly : false,
                    minRating: draft.places.minRatingEnabled ? draft.places.minRating : null,
                    outdoorSeating: !!draft.places.outdoorSeating,
                    liveMusic: !!draft.places.liveMusic,
                    reservable: !!draft.places.reservable,
                    dogFriendly: !!draft.places.dogFriendly,
                    avoid: {
                        chains: !!draft.places.avoid.chains,
                        fastFood: !!draft.places.avoid.fastFood,
                        bars: !!draft.places.avoid.bars,
                    },
                }
                : null,

            eventFilters: showEvents
                ? {
                    category: eventCategory, // keep compat if backend expects it
                    freeOnly: !!draft.events.freeOnly,
                    sort: draft.events.sort,
                }
                : null,
        };

        onSubmitCustomSearch(draft.mode, payload);
        closeModal();
    }, [
        canSubmit,
        draft,
        isFamilyFriendly,
        budgetApplies,
        budget,
        showPlaces,
        showEvents,
        radius,
        onSubmitCustomSearch,
        closeModal,
    ]);

    const modeLabel = useMemo(() => getLabel(MODE_OPTIONS, draft.mode, null), [draft.mode]);
    const placeCategoryLabel = useMemo(
        () => getLabel(PLACE_CATEGORY_OPTIONS, draft.placeCategory, "Anything"),
        [draft.placeCategory]
    );
    const eventCategoryLabel = useMemo(
        () => getLabel(EVENT_CATEGORY_OPTIONS, draft.eventCategory, "Any"),
        [draft.eventCategory]
    );

    const advancedCount = useMemo(
        () => countActiveAdvanced(draft, showPlaces, showEvents),
        [draft, showPlaces, showEvents]
    );

    const pickerConfig = useMemo(() => {
        if (activePicker === "placeCategory") {
            return {
                title: "Place category",
                options: PLACE_CATEGORY_OPTIONS,
                selectedValue: draft.placeCategory,
                onValueChange: (v) => setDraftField("placeCategory", v),
            };
        }

        if (activePicker === "eventCategory") {
            return {
                title: "Event category",
                options: EVENT_CATEGORY_OPTIONS,
                selectedValue: draft.eventCategory,
                onValueChange: (v) => setDraftField("eventCategory", v),
            };
        }

        return null;
    }, [activePicker, draft.placeCategory, draft.eventCategory, setDraftField]);

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="none">
            <KeyboardAvoidingView
                style={styles.modalOverlay}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <Pressable style={styles.backdrop} onPress={closeModal} />
                <GestureDetector gesture={gesture}>
                    <Animated.View style={[styles.sheet, animatedStyle]}>
                        <Notch />
                        {!coordinates ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#2196F3" />
                            </View>
                        ) : (
                            <>
                                <ScrollView
                                    style={styles.scroll}
                                    contentContainerStyle={styles.scrollContent}
                                    keyboardShouldPersistTaps="handled"
                                    showsVerticalScrollIndicator={false}
                                >
                                    <SearchSection
                                        modeLabel={modeLabel}
                                        mode={draft.mode}
                                        setMode={(m) => setDraftField("mode", m)}
                                        showPlaces={showPlaces}
                                        showEvents={showEvents}
                                        placeCategoryLabel={placeCategoryLabel}
                                        eventCategoryLabel={eventCategoryLabel}
                                        onOpenPlaceCategory={() => setActivePicker("placeCategory")}
                                        onOpenEventCategory={() => setActivePicker("eventCategory")}
                                        budgetApplies={budgetApplies}
                                        budget={budget}
                                        setBudget={(b) => dispatch(setBudget(b))}
                                    />
                                    <ContextSection
                                        when={draft.when}
                                        setWhen={(v) => setDraftField("when", v)}
                                        customWhen={draft.customWhen}
                                        setCustomWhen={(v) => setDraftField("customWhen", v)}
                                        whenOptions={WHEN_OPTIONS}
                                        who={draft.who}
                                        setWho={(v) => setDraftField("who", v)}
                                        whoOptions={WHO_OPTIONS}
                                        vibes={draft.vibes}
                                        toggleVibe={toggleVibe}
                                        vibeOptions={VIBE_OPTIONS}
                                        keyword={draft.keyword}
                                        setKeyword={(t) => setDraftField("keyword", t)}
                                        isFamilyFriendly={isFamilyFriendly}
                                        setIsFamilyFriendly={(v) => dispatch(setIsFamilyFriendly(v))}
                                        distance={distance}
                                        onDistanceChange={(v) => dispatch(setDistance(v))}
                                    />
                                    <AdvancedToggleSection
                                        expanded={draft.showAdvanced}
                                        activeCount={advancedCount}
                                        onToggle={() => setDraftField("showAdvanced", !draft.showAdvanced)}
                                    />
                                    <PlacesFiltersSection
                                        show={showPlaces && !!draft.showAdvanced}
                                        when={draft.when}
                                        openNowOnly={draft.places.openNowOnly}
                                        setOpenNowOnly={(v) => setDraftField("places.openNowOnly", v)}
                                        minRatingEnabled={draft.places.minRatingEnabled}
                                        setMinRatingEnabled={(v) => setDraftField("places.minRatingEnabled", v)}
                                        minRating={draft.places.minRating}
                                        setMinRating={(v) => setDraftField("places.minRating", v)}
                                        outdoorSeating={draft.places.outdoorSeating}
                                        setOutdoorSeating={(v) => setDraftField("places.outdoorSeating", v)}
                                        liveMusic={draft.places.liveMusic}
                                        setLiveMusic={(v) => setDraftField("places.liveMusic", v)}
                                        reservable={draft.places.reservable}
                                        setReservable={(v) => setDraftField("places.reservable", v)}
                                        dogFriendly={draft.places.dogFriendly}
                                        setDogFriendly={(v) => setDraftField("places.dogFriendly", v)}
                                        avoidChains={draft.places.avoid.chains}
                                        setAvoidChains={(v) => setDraftField("places.avoid.chains", v)}
                                        avoidFastFood={draft.places.avoid.fastFood}
                                        setAvoidFastFood={(v) => setDraftField("places.avoid.fastFood", v)}
                                        avoidBars={draft.places.avoid.bars}
                                        setAvoidBars={(v) => setDraftField("places.avoid.bars", v)}
                                    />
                                    <EventFiltersSection
                                        show={showEvents && !!draft.showAdvanced}
                                        freeOnly={draft.events.freeOnly}
                                        setFreeOnly={(v) => setDraftField("events.freeOnly", v)}
                                        eventSort={draft.events.sort}
                                        setEventSort={(v) => setDraftField("events.sort", v)}
                                    />
                                </ScrollView>
                                <FooterSection onReset={reset} onSubmit={handleSubmit} canSubmit={canSubmit} />
                            </>
                        )}
                    </Animated.View>
                </GestureDetector>
                {/* Single WheelPicker instance */}
                <WheelPicker
                    visible={!!pickerConfig}
                    onClose={() => setActivePicker(null)}
                    selectedValue={pickerConfig?.selectedValue}
                    onValueChange={(v) => pickerConfig?.onValueChange?.(v)}
                    options={pickerConfig?.options || []}
                />
            </KeyboardAvoidingView>
        </Modal>
    );
}
