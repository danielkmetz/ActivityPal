import React, { useEffect, useMemo } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Alert,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { selectUser } from "../../../Slices/UserSlice";
import {
    selectHiddenPosts,
    selectHiddenPostsStatus,
    fetchHiddenTaggedPosts,
    unhideTaggedPost,
    removeFromHiddenTagged,
} from "../../../Slices/TaggedPostsSlice";
import { addPostToProfileSortedByDate } from "../../../Slices/ReviewsSlice";
import Reviews from "../../Reviews/Reviews";
import { normalizePostType } from "../../../utils/normalizePostType";

export default function HiddenPostsScreen({ scrollY, onScroll, isAtEnd }) {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const userId = user?.id;

    const hiddenPosts = useSelector(selectHiddenPosts);
    const hiddenStatus = useSelector(selectHiddenPostsStatus);

    useEffect(() => {
        dispatch(fetchHiddenTaggedPosts());
    }, [userId, dispatch]);

    const mappedHidden = useMemo(() => {
        return (hiddenPosts || []).map(h => {
            const p = h.post || {};
            return {
                ...p,
                type: normalizePostType(p.type),
                // keep hidden metadata if you want to unhide later
                __hidden: true,
                __hiddenMeta: {
                    hiddenId: h.hiddenId,
                    targetId: h.targetId,
                    targetRef: h.targetRef,
                    hiddenCreatedAt: h.createdAt,
                },
            };
        });
    }, [hiddenPosts]);

    const feedHidden = useMemo(() => {
        return [...mappedHidden].sort((a, b) =>
            new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)
        );
    }, [mappedHidden]);

    const onUnhide = async (item) => {
        try {
            await dispatch(
                unhideTaggedPost({ postType: item.postType, postId: item._id })
            ).unwrap();

            Alert.alert("Post unhidden", "This post is visible on your profile again.");

            // keep local list in sync and put it back on profile (sorted)
            dispatch(removeFromHiddenTagged({ postType: item.postType, postId: item._id }));
            dispatch(addPostToProfileSortedByDate(item));
        } catch (e) {
            Alert.alert("Failed to unhide", e?.message || "Please try again.");
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
                    <MaterialCommunityIcons name="chevron-left" size={28} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Hidden Posts</Text>
                <View style={{ width: 28 }} />
            </View>

            {/* Content */}
            {hiddenStatus === "loading" ? (
                <View style={styles.centerRow}>
                    <ActivityIndicator />
                    <Text style={{ marginLeft: 10 }}>Loading hidden posts…</Text>
                </View>
            ) : !hiddenPosts || hiddenPosts.length === 0 ? (
                <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="eye-off" size={32} color="#666" />
                    <Text style={styles.emptyTitle}>No Hidden Posts</Text>
                    <Text style={styles.emptySubtitle}>
                        Posts you hide will appear here so you can unhide them later.
                    </Text>
                </View>
            ) : (
                <Reviews
                    scrollY={scrollY}
                    onScroll={onScroll}
                    reviews={feedHidden}
                    ListHeaderComponent={() => { }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f5f5f5", paddingTop: 85 },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
        justifyContent: "space-between",
    },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    hiddenCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fafafa",
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 10,
        padding: 12,
    },
    hiddenTitle: { fontWeight: "700", marginBottom: 2 },
    hiddenSubtitle: { color: "#666", fontSize: 12, marginBottom: 6 },
    hiddenExcerpt: { color: "#333", fontSize: 13 },
    unhideBtn: {
        marginLeft: 10,
        backgroundColor: "#000",
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    unhideText: { color: "#fff", fontWeight: "700" },
    centerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
    emptyState: { alignItems: "center", paddingVertical: 20 },
    emptyTitle: { marginTop: 8, fontWeight: "700" },
    emptySubtitle: { color: "#666", marginTop: 4, textAlign: "center" },
});
