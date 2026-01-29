import React, { useEffect, useCallback, useState, useRef } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, TextInput, FlatList, ActivityIndicator } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { fetchPlacePredictions, clearPredictions, selectPlacePredictions, selectPlaceSearchStatus, fetchPlaceDetails } from "../../Slices/placeSearchSlice";
import { selectPlacePhotosById, fetchPlaceThumbnailsBatch } from "../../Slices/PlacePhotosSlice";

function parseCityState(terms) {
    const t = Array.isArray(terms) ? terms : [];
    const city = t[1]?.value || t[0]?.value || "Unknown City";
    const state = t[2]?.value || t[1]?.value || "Unknown State";
    return { city, state };
}

function useDebouncedValue(value, delay = 400) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

export default function SearchBar({ lat, lng, onSelectPlace }) {
    const dispatch = useDispatch();
    const predictions = useSelector(selectPlacePredictions);
    const status = useSelector(selectPlaceSearchStatus);
    const photosById = useSelector(selectPlacePhotosById);
    const [localValue, setLocalValue] = useState("");
    const debounced = useDebouncedValue(localValue, 450);
    const lastReqRef = useRef(null);
    const lastThumbReqRef = useRef(null);
    
    useEffect(() => {
        const q = (debounced || "").trim();

        if (q.length < 3) {
            dispatch(clearPredictions());
            lastReqRef.current?.abort?.();
            return;
        }

        lastReqRef.current?.abort?.();
        const promise = dispatch(fetchPlacePredictions({ input: q, lat, lng }));
        lastReqRef.current = promise;

        return () => promise.abort?.();
    }, [debounced, lat, lng, dispatch]);

    useEffect(() => {
        if (!Array.isArray(predictions) || predictions.length === 0) return;

        const ids = predictions.map((p) => p?.place_id).filter(Boolean);
        if (ids.length === 0) return;

        // ✅ Only treat *missing entries* as missing
        // If we already stored { url: null }, that means "known no photo" and should NOT refetch forever.
        const missing = ids.filter((id) => photosById?.[id] === undefined);
        if (missing.length === 0) return;

        const toFetch = missing.slice(0, 10);

        lastThumbReqRef.current?.abort?.();

        const t = setTimeout(() => {
            const promise = dispatch(fetchPlaceThumbnailsBatch(toFetch));
            lastThumbReqRef.current = promise;
        }, 150);

        return () => {
            clearTimeout(t);
            lastThumbReqRef.current?.abort?.();
        };
    }, [predictions, photosById, dispatch]);

    const handlePressRow = useCallback(
        async (prediction) => {
            const placeId = prediction?.place_id;
            if (!placeId) return;

            try {
                const out = await dispatch(fetchPlaceDetails(placeId)).unwrap();
                onSelectPlace?.(prediction, out?.details || null);
            } catch {
                onSelectPlace?.(prediction, null);
            }
        },
        [dispatch, onSelectPlace]
    );

    const renderItem = useCallback(
        ({ item }) => {
            const placeId = item?.place_id;
            const { city, state } = parseCityState(item?.terms);

            const imageUrl = photosById?.[placeId]?.url ?? null;

            return (
                <TouchableOpacity onPress={() => handlePressRow(item)}>
                    <View style={styles.row}>
                        {imageUrl ? (
                            <Image source={{ uri: imageUrl }} style={styles.placeImage} />
                        ) : (
                            <View style={styles.imagePlaceholder} />
                        )}
                        <View style={{ flex: 1 }}>
                            <Text style={styles.placeText} numberOfLines={1}>
                                {item?.structured_formatting?.main_text || item?.description || "Unknown Place"}
                            </Text>
                            <Text style={styles.cityStateText}>
                                {city}, {state}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        },
        [photosById, handlePressRow]
    );

    const showList = (localValue || "").trim().length >= 3 && (predictions?.length > 0 || status === "loading");

    return (
        <View style={styles.searchContainer}>
            <TextInput
                value={localValue}
                onChangeText={setLocalValue}
                placeholder="Search places..."
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
            />
            {showList && (
                <View style={styles.listView}>
                    {status === "loading" && (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator />
                            <Text style={{ marginLeft: 8 }}>Searching…</Text>
                        </View>
                    )}
                    <FlatList
                        keyboardShouldPersistTaps="handled"
                        data={predictions}
                        keyExtractor={(item, idx) => item?.place_id || String(idx)}
                        renderItem={renderItem}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    searchContainer: { width: "100%", alignSelf: "center", paddingHorizontal: 10 },
    searchInput: { height: 40, borderWidth: 1, borderColor: "#ccc", borderRadius: 15, paddingHorizontal: 10, backgroundColor: "white" },
    listView: { position: "absolute", top: 50, left: 10, right: 10, backgroundColor: "#fff", zIndex: 1000, borderRadius: 10, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, maxHeight: 320, overflow: "hidden" },
    loadingRow: { flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
    row: { flexDirection: "row", alignItems: "center", padding: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
    placeImage: { width: 40, height: 40, borderRadius: 5, marginRight: 10 },
    imagePlaceholder: { width: 40, height: 40, borderRadius: 5, marginRight: 10, backgroundColor: "#eee" },
    placeText: { fontSize: 16, color: "#333" },
    cityStateText: { fontSize: 12, color: "#777" },
});
