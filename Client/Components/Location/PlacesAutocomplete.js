import React, { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { View, TextInput, FlatList, TouchableOpacity, Text, StyleSheet, Keyboard, ActivityIndicator } from "react-native";
import api from "../../api";

function useDebouncedValue(value, delay) {
    const timeoutRef = useRef(null);
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setDebounced(value), delay);
        return () => timeoutRef.current && clearTimeout(timeoutRef.current);
    }, [value, delay]);

    return debounced;
}

/**
 * PlacesAutocomplete (local state)
 * - predictions + input are transient UI state (NOT Redux)
 * - supports prefillLabel (edit mode) without fetching for it
 * - clears parent "business" when user edits after selection (prevents stale placeId submits)
 * - avoids blur-kills-tap bug by delaying dropdown close slightly
 * - aborts in-flight requests on new queries + unmount
 *
 * Expected backend payloads:
 * GET /api/places/autocomplete -> { predictions: PlacePrediction[] , thumbnails?: object }
 * GET /api/places/details      -> { result: PlaceDetails | null }
 */
export default function PlacesAutocomplete({
    onPlaceSelected,
    lat = null,
    lng = null,
    prefillLabel = "",
    onClear = null, // clears parent "business"
    maxResults = 6,
    minChars = 3,
    debounceMs = 500,
}) {
    const [queryText, setQueryText] = useState("");
    const [predictions, setPredictions] = useState([]);
    const [status, setStatus] = useState("idle"); // idle | loading | succeeded | failed
    const [isFocused, setIsFocused] = useState(false);
    const debouncedQuery = useDebouncedValue(queryText, debounceMs);
    const selectedLabelRef = useRef("");
    const abortRef = useRef(null);
    const reqSeqRef = useRef(0);
    const blurTimeoutRef = useRef(null);

    const getAxiosErrorMessage = (err) => {
        const data = err?.response?.data;
        return (
            data?.error ||
            data?.message ||
            (typeof data === "string" ? data : null) ||
            err?.message ||
            "Request failed"
        );
    };

    // ✅ return ONLY predictions array (ignore thumbnails for now)
    const fetchPredictionsApi = useCallback(async ({ input, lat, lng, signal }) => {
        const params = { input };
        if (lat != null) params.lat = String(lat);
        if (lng != null) params.lng = String(lng);

        try {
            const { data } = await api.get("/api/places/autocomplete", { params, signal });
            return Array.isArray(data?.predictions) ? data.predictions : [];
        } catch (err) {
            throw new Error(getAxiosErrorMessage(err));
        }
    }, []);

    const fetchPlaceDetailsApi = useCallback(async ({ placeId, signal }) => {
        if (!placeId) return null;

        try {
            const { data } = await api.get("/api/places/details", {
                params: { placeId },
                signal,
            });
            return data?.result ?? null;
        } catch (err) {
            throw new Error(getAxiosErrorMessage(err));
        }
    }, []);

    // ✅ Prefill from parent (edit mode) and LOCK it (no fetch)
    useEffect(() => {
        const label = (prefillLabel || "").trim();
        if (!label) return;

        selectedLabelRef.current = label;
        setQueryText(label);
        setPredictions([]);
        setStatus("idle");
    }, [prefillLabel]);

    // ✅ Abort on unmount
    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort();
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        };
    }, []);

    // ✅ Fetch predictions when user types (not for locked selection/prefill)
    useEffect(() => {
        const q = (debouncedQuery || "").trim();

        // don't fetch for locked selection/prefill
        if (q && selectedLabelRef.current && q === selectedLabelRef.current) return;

        if (!isFocused) return; // don't fetch if user isn't interacting

        if (q.length < minChars) {
            setPredictions([]);
            setStatus("idle");
            return;
        }

        // abort prior request
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const mySeq = ++reqSeqRef.current;
        setStatus("loading");

        (async () => {
            try {
                const items = await fetchPredictionsApi({
                    input: q,
                    lat,
                    lng,
                    signal: controller.signal,
                });

                if (controller.signal.aborted) return;
                if (mySeq !== reqSeqRef.current) return;

                setPredictions(Array.isArray(items) ? items : []);
                setStatus("succeeded");
            } catch (e) {
                if (controller.signal.aborted) return;
                if (mySeq !== reqSeqRef.current) return;
                setPredictions([]);
                setStatus("failed");
            }
        })();

        return () => controller.abort();
    }, [debouncedQuery, lat, lng, fetchPredictionsApi, isFocused, minChars]);

    const visiblePredictions = useMemo(() => {
        const arr = Array.isArray(predictions) ? predictions : [];
        return arr.slice(0, maxResults);
    }, [predictions, maxResults]);

    const closeDropdown = useCallback(() => {
        setPredictions([]);
    }, []);

    const handleClear = useCallback(() => {
        selectedLabelRef.current = "";
        setQueryText("");
        setPredictions([]);
        setStatus("idle");
        onClear?.();
    }, [onClear]);

    const onSelect = useCallback(
        async (prediction) => {
            // cancel pending blur close so taps work reliably
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);

            const placeId = prediction?.place_id;
            if (!placeId) return;

            // abort any in-flight autocomplete request
            if (abortRef.current) abortRef.current.abort();

            try {
                const controller = new AbortController();

                const details = await fetchPlaceDetailsApi({
                    placeId,
                    signal: controller.signal,
                });

                const label =
                    details?.name ||
                    prediction?.structured_formatting?.main_text ||
                    prediction?.description ||
                    "";

                const trimmed = (label || "").trim();

                // lock selection
                selectedLabelRef.current = trimmed;

                if (trimmed) setQueryText(trimmed);

                closeDropdown();
                Keyboard.dismiss();

                if (details) onPlaceSelected(details);
            } catch {
                closeDropdown();
            }
        },
        [fetchPlaceDetailsApi, onPlaceSelected, closeDropdown]
    );

    const renderItem = useCallback(
        ({ item }) => {
            const main = item?.structured_formatting?.main_text || item?.description || "";
            const secondary = item?.structured_formatting?.secondary_text || "";

            return (
                <TouchableOpacity style={styles.row} onPress={() => onSelect(item)}>
                    <Text style={styles.mainText} numberOfLines={1}>
                        {main}
                    </Text>
                    {!!secondary && (
                        <Text style={styles.secondaryText} numberOfLines={1}>
                            {secondary}
                        </Text>
                    )}
                </TouchableOpacity>
            );
        },
        [onSelect]
    );

    const showList = isFocused && visiblePredictions.length > 0;

    return (
        <View style={styles.wrap}>
            <View style={styles.inputWrap}>
                <TextInput
                    value={queryText}
                    onChangeText={(t) => {
                        const next = t || "";
                        const locked = selectedLabelRef.current;

                        // user edits after selection/prefill -> unlock + clear parent business
                        if (locked && next.trim() !== locked) {
                            selectedLabelRef.current = "";
                            onClear?.(); // ✅ critical: prevents stale placeId submits
                        }

                        setQueryText(next);
                    }}
                    placeholder="Search for a business"
                    style={styles.input}
                    autoCorrect={false}
                    autoCapitalize="none"
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => {
                        setIsFocused(false);
                        // delay closing so list taps can register before blur kills it
                        blurTimeoutRef.current = setTimeout(() => {
                            closeDropdown();
                            setStatus("idle");
                        }, 120);
                    }}
                    returnKeyType="search"
                />

                {!!queryText && (
                    <TouchableOpacity onPress={handleClear} style={styles.clearBtn} hitSlop={12}>
                        <Text style={styles.clearText}>×</Text>
                    </TouchableOpacity>
                )}

                {isFocused && status === "loading" && (
                    <View style={styles.spinner}>
                        <ActivityIndicator size="small" />
                    </View>
                )}
            </View>

            {showList && (
                <View style={styles.listWrap}>
                    <FlatList
                        data={visiblePredictions}
                        keyExtractor={(item, idx) => item?.place_id || String(idx)}
                        renderItem={renderItem}
                        keyboardShouldPersistTaps="always"
                        style={{ flexGrow: 0 }}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { zIndex: 99999, elevation: 50, position: "relative" },
    inputWrap: { position: "relative" },
    input: {
        backgroundColor: "#f5f5f5",
        height: 50,
        borderRadius: 5,
        paddingHorizontal: 10,
        paddingRight: 44, // room for X / spinner
        borderWidth: 1,
        borderColor: "#ccc",
        fontSize: 16,
    },
    clearBtn: {
        position: "absolute",
        right: 10,
        top: 0,
        height: 50,
        width: 34,
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.6,
    },
    clearText: { fontSize: 22, lineHeight: 22 },
    spinner: {
        position: "absolute",
        right: 38,
        top: 0,
        height: 50,
        width: 24,
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.6,
    },
    listWrap: {
        position: "absolute",
        top: 56,
        left: 0,
        right: 0,
        backgroundColor: "white",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#eee",
        maxHeight: 6 * 52,
        overflow: "hidden",
        zIndex: 99999,
        elevation: 60,
    },
    row: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f1f1",
    },
    mainText: { fontSize: 15 },
    secondaryText: { fontSize: 13, opacity: 0.6, marginTop: 2 },
});
