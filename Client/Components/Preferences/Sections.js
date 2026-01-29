import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Platform } from "react-native";
import Slider from "@react-native-community/slider";
import styles from "./PrefModalStyles";
import { Chip, ToggleRow } from "./PrefModalComponents";
import { computeTargetAt, formatTargetLabel, mergeTimeKeepDate, mergeDateKeepTime, toCustomWhen } from "../../utils/Activities/whenMoment";
import { DEFAULT_WHEN_TIME_HHMM } from "./PreferencesModalConstants";
import DateTimePicker from "@react-native-community/datetimepicker";

function ensureArray(v) {
    return Array.isArray(v) ? v : [];
}

// --------------------
// UI wrappers
// --------------------
function Card({ title, subtitle, children }) {
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{title}</Text>
                {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
            </View>
            {children}
        </View>
    );
}

function PickerRow({ label, valueLabel, onPress }) {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <TouchableOpacity style={styles.pickerButtonCompact} onPress={onPress} activeOpacity={0.85}>
                <Text style={styles.selectedText}>{valueLabel}</Text>
            </TouchableOpacity>
        </View>
    );
}

// --------------------
// Sections
// --------------------
export function SearchSection({
    mode,
    setMode,
    showPlaces,
    showEvents,
    placeCategoryLabel,
    eventCategoryLabel,
    onOpenPlaceCategory,
    onOpenEventCategory,
    budgetApplies,
    budget,
    setBudget,
}) {
    return (
        <Card title="Search" subtitle="Start broad. Add details only if you actually care.">
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Mode</Text>
                <View style={styles.rowWrap}>
                    <Chip label="Places" selected={mode === "places"} onPress={() => setMode("places")} />
                    <Chip label="Events" selected={mode === "events"} onPress={() => setMode("events")} />
                    <Chip label="Mixed" selected={mode === "mixed"} onPress={() => setMode("mixed")} />
                </View>
            </View>
            {showPlaces ? (
                <View style={styles.sectionTight}>
                    <PickerRow label="Place category" valueLabel={placeCategoryLabel} onPress={onOpenPlaceCategory} />
                </View>
            ) : null}
            {budgetApplies ? (
                <View style={styles.sectionTight}>
                    <Text style={styles.sectionTitle}>Budget (optional)</Text>
                    <View style={styles.rowWrap}>
                        <Chip label="Any" selected={!budget} onPress={() => setBudget(null)} />
                        {["$", "$$", "$$$", "$$$$"].map((b) => (
                            <Chip key={b} label={b} selected={budget === b} onPress={() => setBudget(b)} />
                        ))}
                    </View>
                </View>
            ) : null}
            {showEvents ? (
                <View style={styles.sectionTight}>
                    <PickerRow label="Event category" valueLabel={eventCategoryLabel} onPress={onOpenEventCategory} />
                </View>
            ) : null}
        </Card>
    );
}

export function ContextSection({
    when,
    setWhen,
    whenOptions,
    who,
    setWho,
    whoOptions,
    vibes,
    toggleVibe,
    vibeOptions,
    keyword,
    setKeyword,
    isFamilyFriendly,
    setIsFamilyFriendly,
    distance,
    onDistanceChange,
}) {
    const opts = ensureArray(whenOptions);

    // Picker flow: date -> time
    const [pickerMode, setPickerMode] = useState(null); // "date" | "time" | null
    const [tempDate, setTempDate] = useState(null);     // Date used between steps
    const [customWhen, setCustomWhen] = useState(null);

    const targetAt = computeTargetAt({
        when,
        customWhen,
        defaultHHmm: DEFAULT_WHEN_TIME_HHMM,
    });

    const targetLabel = formatTargetLabel(targetAt);

    const openCustomPicker = () => {
        setWhen("custom");
        const seed = targetAt instanceof Date && !isNaN(targetAt.getTime()) ? targetAt : new Date();
        setTempDate(seed);
        setPickerMode("date"); // render date picker inline immediately
    };

    const handleWhenPress = (value) => {
        if (value === "custom") {
            openCustomPicker();
            return;
        }
        setPickerMode(null);
        setTempDate(null);
        setWhen(value);
    };

    const onPickerChange = (event, selected) => {
        // Android dismissed
        if (Platform.OS === "android" && event?.type === "dismissed") {
            setPickerMode(null);
            setTempDate(null);
            if (!customWhen?.dateISO) setWhen("now");
            return;
        }

        const picked = selected instanceof Date ? selected : null;
        if (!picked) return;

        // Commit immediately (date-only)
        const base = tempDate || new Date();
        const merged = mergeDateKeepTime(base, picked);

        // Force default time (don’t ask user for time)
        const [hhStr, mmStr] = String(DEFAULT_WHEN_TIME_HHMM || "19:00").split(":");
        const hh = Number(hhStr);
        const mm = Number(mmStr);
        if (Number.isFinite(hh) && Number.isFinite(mm)) {
            merged.setHours(hh, mm, 0, 0);
        }

        const next = toCustomWhen(merged);
        if (next) setCustomWhen(next);

        setWhen("custom");

        // Close picker immediately after selection
        setPickerMode(null);
        setTempDate(null);
    };

    // For the picker display value, always use a Date
    const pickerValue = tempDate || targetAt || new Date();

    return (
        <Card title="Timing & vibe" subtitle="Optional. If you don’t choose anything here, you still get results.">
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>When</Text>
                <View style={styles.rowWrap}>
                    {opts.map((o) => (
                        <Chip
                            key={o.value}
                            label={o.label}
                            selected={when === o.value}
                            onPress={() => handleWhenPress(o.value)}
                        />
                    ))}
                </View>
                {/* Date/time picker (2-step) */}
                {pickerMode === "date" ? (
                    <DateTimePicker
                        value={pickerValue}
                        mode={pickerMode}
                        display={"default"}
                        onChange={onPickerChange}
                    />
                ) : null}
                {targetLabel && (
                    <Text style={styles.optionHint}>Target: {targetLabel}</Text>
                )}
            </View>
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Who</Text>
                <View style={styles.rowWrap}>
                    {ensureArray(whoOptions).map((o) => (
                        <Chip
                            key={o.value}
                            label={o.label}
                            selected={who === o.value}
                            onPress={() => setWho(o.value)}
                        />
                    ))}
                </View>
            </View>
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Keyword</Text>
                <TextInput
                    value={keyword}
                    onChangeText={setKeyword}
                    placeholder='Try "trivia", "bowling", "arcade"...'
                    placeholderTextColor="#999"
                    style={styles.textInput}
                    returnKeyType="done"
                />
            </View>
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Group</Text>
                <ToggleRow label="Family friendly" value={!!isFamilyFriendly} onChange={setIsFamilyFriendly} />
            </View>
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Distance</Text>
                <Text style={styles.optionHint}>Within {distance} miles</Text>
                <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={50}
                    step={1}
                    value={distance}
                    onValueChange={onDistanceChange}
                    minimumTrackTintColor="#2196F3"
                    maximumTrackTintColor="#ddd"
                    thumbTintColor="#2196F3"
                />
            </View>
        </Card>
    );
}

export function AdvancedToggleSection({ expanded, activeCount, onToggle }) {
    const label = expanded ? "Hide advanced filters" : "Show advanced filters";
    const suffix =
        !expanded && activeCount ? ` (${activeCount} active)` : expanded && activeCount ? ` (${activeCount})` : "";

    return (
        <View style={styles.advancedToggleWrap}>
            <TouchableOpacity onPress={onToggle} activeOpacity={0.85} style={styles.advancedToggleBtn}>
                <Text style={styles.advancedToggleText}>
                    {label}
                    {suffix}
                </Text>
            </TouchableOpacity>
        </View>
    );
}

export function PlacesFiltersSection({
    show,

    // Needed to avoid “Open now” on future moments
    when,

    openNowOnly,
    setOpenNowOnly,
    minRatingEnabled,
    setMinRatingEnabled,
    minRating,
    setMinRating,
    outdoorSeating,
    setOutdoorSeating,
    liveMusic,
    setLiveMusic,
    reservable,
    setReservable,
    dogFriendly,
    setDogFriendly,
    avoidChains,
    setAvoidChains,
    avoidFastFood,
    setAvoidFastFood,
    avoidBars,
    setAvoidBars,
}) {
    if (!show) return null;

    const showOpenNowOnly = when === "now";

    return (
        <Card title="Places filters" subtitle="Only applied to place results.">
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Must-haves</Text>
                {showOpenNowOnly ? (
                    <ToggleRow label="Open now only" value={!!openNowOnly} onChange={setOpenNowOnly} />
                ) : (
                    <Text style={styles.optionHint}>
                        “Open now” only works for When = Now. For future times we’ll score/filter using hours.
                    </Text>
                )}
                <ToggleRow label="Outdoor seating" value={!!outdoorSeating} onChange={setOutdoorSeating} />
                <ToggleRow label="Live music" value={!!liveMusic} onChange={setLiveMusic} />
                <ToggleRow label="Takes reservations" value={!!reservable} onChange={setReservable} />
                <ToggleRow label="Dog friendly" value={!!dogFriendly} onChange={setDogFriendly} />
            </View>
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Rating</Text>
                <ToggleRow label="Set minimum rating" value={!!minRatingEnabled} onChange={setMinRatingEnabled} />
                {minRatingEnabled ? (
                    <>
                        <Text style={styles.optionHint}>Min rating: {Number(minRating || 0).toFixed(1)}+</Text>
                        <Slider
                            style={styles.slider}
                            minimumValue={3.0}
                            maximumValue={4.8}
                            step={0.1}
                            value={minRating}
                            onValueChange={setMinRating}
                            minimumTrackTintColor="#2196F3"
                            maximumTrackTintColor="#ddd"
                            thumbTintColor="#2196F3"
                        />
                    </>
                ) : null}
            </View>
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Avoid</Text>
                <ToggleRow label="Chains" value={!!avoidChains} onChange={setAvoidChains} />
                <ToggleRow label="Fast food" value={!!avoidFastFood} onChange={setAvoidFastFood} />
                <ToggleRow label="Bars / Nightclubs" value={!!avoidBars} onChange={setAvoidBars} />
            </View>
        </Card>
    );
}

export function EventFiltersSection({ show, freeOnly, setFreeOnly, eventSort, setEventSort }) {
    if (!show) return null;

    return (
        <Card title="Events filters" subtitle="Only applied to event results.">
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Must-haves</Text>
                <ToggleRow label="Free only" value={!!freeOnly} onChange={setFreeOnly} />
            </View>
            <View style={styles.sectionTight}>
                <Text style={styles.sectionTitle}>Sort</Text>
                <View style={styles.rowWrap}>
                    <Chip label="Soonest" selected={eventSort === "date"} onPress={() => setEventSort("date")} />
                    <Chip label="Closest" selected={eventSort === "distance"} onPress={() => setEventSort("distance")} />
                    <Chip label="Best match" selected={eventSort === "relevance"} onPress={() => setEventSort("relevance")} />
                </View>
            </View>
        </Card>
    );
}

export function FooterSection({ onReset, onSubmit, canSubmit }) {
    return (
        <View style={styles.footerSticky}>
            <TouchableOpacity onPress={onReset} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Reset</Text>
            </TouchableOpacity>
            <View style={styles.footerBtnSpacer} />
            <TouchableOpacity
                onPress={onSubmit}
                style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
                disabled={!canSubmit}
            >
                <Text style={styles.primaryBtnText}>{canSubmit ? "Show results" : "Enable location"}</Text>
            </TouchableOpacity>
        </View>
    );
}
