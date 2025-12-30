import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import {
    fetchUserSuggestions,
    sendFollowRequest,
    cancelFollowRequest,
    selectSuggestedUsers,
    selectUserSuggestions,
    selectFollowRequests,
    selectFollowing,
    selectFriends,
    selectStatus,
} from "../Slices/friendsSlice";
import { selectUser } from "../Slices/UserSlice";
import { toId } from "../utils/Formatting/toId";
import SkeletonRow from "../Components/FriendDiscovery/SkeletonRow";
import InviteFriendsCardSkeleton from "../Components/FriendDiscovery/InviteFriendsCardSkeleton";
import DiscoverUserRow from "../Components/FriendDiscovery/DiscoverUserRow";
import { MaterialCommunityIcons } from "@expo/vector-icons";

function useDebouncedValue(value, delay = 350) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

export default function FriendDiscoveryScreen() {
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const me = useSelector(selectUser);
    const myId = toId(me?.id || me?._id);
    const suggestedUsers = useSelector(selectSuggestedUsers) || [];
    const userSuggestions = useSelector(selectUserSuggestions) || [];
    const followRequests = useSelector(selectFollowRequests) || { sent: [], received: [] };
    const following = useSelector(selectFollowing) || [];
    const friends = useSelector(selectFriends) || [];
    const status = useSelector(selectStatus) || "idle";
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebouncedValue(query, 350);

    useEffect(() => {
        const q = (debouncedQuery || "").trim();
        if (q.length < 2) return;
        dispatch(fetchUserSuggestions(q));
    }, [dispatch, debouncedQuery]);

    const isSearching = useMemo(() => (debouncedQuery || "").trim().length >= 2, [debouncedQuery]);
    const rawList = isSearching ? userSuggestions : suggestedUsers;

    const list = useMemo(() => {
        const meIdStr = toId(myId);
        const dedup = new Set();

        return (Array.isArray(rawList) ? rawList : []).filter((u) => {
            const id = toId(u?._id || u?.id);
            if (!id) return false;
            if (meIdStr && id === meIdStr) return false;
            if (dedup.has(id)) return false;
            dedup.add(id);
            return true;
        });
    }, [rawList, myId]);

    const showSkeleton = useMemo(() => {
        return status === "loading" && list.length === 0;
    }, [status, list.length]);

    const skeletonRows = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ id: String(i) })), []);

    const sentSet = useMemo(() => {
        const sent = Array.isArray(followRequests?.sent) ? followRequests.sent : [];
        const s = new Set();
        sent.forEach((x) => s.add(toId(x?._id || x?.id || x)));
        return s;
    }, [followRequests]);

    const followingSet = useMemo(() => {
        const s = new Set();
        (Array.isArray(following) ? following : []).forEach((x) => s.add(toId(x?._id || x?.id || x)));
        return s;
    }, [following]);

    const friendsSet = useMemo(() => {
        const s = new Set();
        (Array.isArray(friends) ? friends : []).forEach((x) => s.add(toId(x?._id || x?.id || x)));
        return s;
    }, [friends]);

    const onPressInvite = useCallback(() => {
        // wire later (Share sheet / SMS)
    }, []);

    const onClearQuery = useCallback(() => {
        setQuery("");
    }, []);

    const renderItem = useCallback(
        ({ item }) => {
            if (showSkeleton) return <SkeletonRow />;

            const id = toId(item?._id || item?.id);
            const isFollowingAlready = followingSet.has(id) || friendsSet.has(id);
            const isRequested = sentSet.has(id);

            let followLabel = "Follow";
            let followDisabled = false;

            if (isFollowingAlready) {
                followLabel = "Following";
                followDisabled = true;
            } else if (isRequested) {
                followLabel = "Requested";
                followDisabled = false; // allow cancel
            }

            const subtitle = isSearching ? "Search result" : "Suggested for you";

            return (
                <DiscoverUserRow
                    user={item}
                    subtitle={subtitle}
                    followLabel={followLabel}
                    followDisabled={followDisabled}
                    onPressProfile={() => navigation.navigate("OtherUserProfile", { userId: id })}
                    onPressFollow={() => {
                        if (!id) return;
                        if (isFollowingAlready) return;

                        if (isRequested) {
                            dispatch(cancelFollowRequest(id));
                            return;
                        }

                        dispatch(sendFollowRequest(id));
                    }}
                />
            );
        },
        [dispatch, navigation, showSkeleton, followingSet, friendsSet, sentSet, isSearching]
    );

    const data = showSkeleton ? skeletonRows : list;
    const emptyTitle = isSearching ? "No results" : "No suggestions yet";
    const emptySub = isSearching ? "Try a different name." : "Invite a friend or search by name.";

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
                {/* Search */}
                <View style={styles.searchWrap}>
                    <View style={styles.searchBox}>
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search by name"
                            placeholderTextColor="#999"
                            style={styles.searchInput}
                            autoCorrect={false}
                            autoCapitalize="words"
                        />
                        {!!query && (
                            <TouchableOpacity
                                onPress={onClearQuery}
                                style={styles.clearBtn}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel="Clear search"
                            >
                                <Text style={styles.clearText}>×</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
                {/* Invite card */}
                {showSkeleton ? (
                    <InviteFriendsCardSkeleton />
                ) : (
                    <TouchableOpacity style={styles.inviteCard} onPress={onPressInvite} activeOpacity={0.85}>
                        <View style={styles.inviteIcon}>
                            <MaterialCommunityIcons
                                name="account-plus"
                                size={22}
                                color="#111"
                                style={{ opacity: 0.55 }}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.inviteTitle}>Invite friends</Text>
                            <Text style={styles.inviteSub}>Share a link or text an invite</Text>
                        </View>
                        <View style={styles.inviteCtaPill}>
                            <Text style={styles.inviteCtaText}>Invite</Text>
                        </View>
                    </TouchableOpacity>
                )}
                <FlatList
                    data={data}
                    keyExtractor={(item, idx) => (item?.id ? String(item.id) : item?._id ? String(item._id) : String(idx))}
                    contentContainerStyle={[styles.listContent, data.length === 0 && !showSkeleton ? { flexGrow: 1 } : null]}
                    keyboardShouldPersistTaps="handled"
                    renderItem={renderItem}
                    ItemSeparatorComponent={() => <View style={styles.sep} />}
                    ListEmptyComponent={
                        showSkeleton ? null : (
                            <View style={styles.empty}>
                                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                                <Text style={styles.emptySub}>{emptySub}</Text>
                            </View>
                        )
                    }
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#f6f7fb" },
    container: { flex: 1, paddingHorizontal: 14, paddingTop: 80, },
    searchWrap: { paddingTop: 10, paddingBottom: 10 },
    searchBox: {
        position: "relative",
        justifyContent: "center",
    },
    searchInput: {
        height: 44,
        borderRadius: 12,
        backgroundColor: "#fff",
        paddingHorizontal: 12,
        paddingRight: 40, // space for the X button
        borderWidth: 1,
        borderColor: "#e6e6ef",
        color: "#111",
    },
    clearBtn: {
        position: "absolute",
        right: 10,
        height: 28,
        width: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#eef0f6",
    },
    clearText: {
        fontSize: 20,
        lineHeight: 20,
        fontWeight: "900",
        color: "#111",
        marginTop: -1,
    },
    inviteCard: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: "#e6e6ef",
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
    },
    inviteIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "rgba(17,17,17,0.08)",
        marginRight: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    inviteTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
    inviteSub: { marginTop: 2, fontSize: 12, color: "#666" },
    inviteCtaPill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "#111",
        opacity: 0.9,
        marginLeft: 12,
    },
    inviteCtaText: { color: "#fff", fontWeight: "800", fontSize: 12 },
    listContent: { paddingBottom: 18 },
    sep: { height: 10 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 40 },
    emptyTitle: { fontSize: 16, fontWeight: "900", color: "#111" },
    emptySub: { marginTop: 6, fontSize: 12, color: "#666" },
});
