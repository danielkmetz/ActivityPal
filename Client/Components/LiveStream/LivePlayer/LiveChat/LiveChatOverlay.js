import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput,
    TouchableOpacity, KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../../../Slices/UserSlice';
import {
    addOptimistic,
    removeOptimistic,
    receiveLiveMessage,
    selectLiveMessages,
    selectLivePinnedId,
    selectLiveTypingMap,
} from '../../../../Slices/LiveChatSlice';
import { sendLiveMessage, setLiveTyping } from '../../../../app/socket/liveChatSocketClient';

const SCREEN_H = Dimensions.get('window').height;
const CHAT_MAX_HEIGHT = Math.round(SCREEN_H * 0.30);
const BOTTOM_EPS = 10;

/**
 * Pure view: no socket connect/join/clear or event wiring here.
 * Assumes the parent screen called useLiveChatSession(liveId) to keep the session alive.
 */
export default function LiveChatOverlay({ liveId }) {
    const dispatch = useDispatch();
    const insets = useSafeAreaInsets();
    const KB_OFFSET = (insets?.bottom || 0) + 8;
    const user = useSelector(selectUser);

    const messages = useSelector((s) => selectLiveMessages(s, liveId));
    const pinnedId = useSelector((s) => selectLivePinnedId(s, liveId));
    const typingMap = useSelector((s) => selectLiveTypingMap(s, liveId));

    const [input, setInput] = useState('');

    // Scrolling state
    const listRef = useRef(null);
    const contentHeightRef = useRef(0);
    const layoutHeightRef = useRef(0);
    const scrollYRef = useRef(0);
    const [hasReachedMaxOnce, setHasReachedMaxOnce] = useState(false);
    const isUserDraggingRef = useRef(false);

    const pinnedMessage = useMemo(() => {
        if (!pinnedId) return null;
        return messages.find(m => String(m._id) === String(pinnedId)) || null;
    }, [pinnedId, messages]);

    const isAtBottom = () => {
        const ch = contentHeightRef.current;
        const lh = layoutHeightRef.current;
        const y = scrollYRef.current;
        if (lh === 0) return true;
        return ch - (y + lh) <= BOTTOM_EPS;
    };

    const maybeAutoScroll = (animated = true) => {
        if (!listRef.current) return;
        if (isUserDraggingRef.current) return;
        if (isAtBottom() || !hasReachedMaxOnce) {
            listRef.current.scrollToEnd?.({ animated });
        }
    };

    useEffect(() => {
        maybeAutoScroll(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages.length]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text) return;

        const optimistic = {
            _id: `local:${Date.now()}`,
            localId: `local-${Math.random().toString(36).slice(2)}`,
            liveStreamId: liveId,
            userId: user?.id || user?._id || 'me',
            userName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user?.fullName || 'Me'),
            userPicUrl: user?.profilePicUrl || user?.profilePic || null,
            type: 'message',
            text,
            offsetSec: 0,
            createdAt: new Date().toISOString(),
            pending: true,
        };

        dispatch(addOptimistic({ liveStreamId: liveId, optimistic }));
        setInput('');
        requestAnimationFrame(() => maybeAutoScroll(true));

        const ack = await sendLiveMessage({ liveStreamId: liveId, text, type: 'message' });
        if (!ack?.ok) {
            dispatch(removeOptimistic({ liveStreamId: liveId, localId: optimistic.localId }));
            return;
        }
        if (ack.message) {
            // Let reducer reconcile optimistic via localId
            dispatch(receiveLiveMessage({ ...ack.message, localId: optimistic.localId }));
        }
    };

    const onChangeInput = (t) => {
        setInput(t);
        setLiveTyping(liveId, !!t.trim());
    };

    const renderItem = ({ item }) => {
        if (item.type === 'system') {
            return <Text style={S.system}>{item.text}</Text>;
        }
        return (
            <View style={[S.bubble, item.pending && S.pending]}>
                <Text style={S.name}>{item.userName || 'User'}</Text>
                <Text style={S.msg}>{item.text}</Text>
            </View>
        );
    };

    const typingUserIds = Object.keys(typingMap || {}).filter((uid) => {
        const ts = typingMap[uid];
        return ts && Date.now() - ts < 3000;
    });

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={S.wrap}>
            {pinnedMessage && (
                <View style={S.pinned}>
                    <Text style={S.pinnedLabel}>Pinned</Text>
                    <Text numberOfLines={1} style={S.pinnedText}>{pinnedMessage.text}</Text>
                </View>
            )}
            <View
                collapsable={false}
                style={[S.listBox, { height: CHAT_MAX_HEIGHT }]}
                onLayout={() => {
                    layoutHeightRef.current = CHAT_MAX_HEIGHT;
                    if (contentHeightRef.current >= CHAT_MAX_HEIGHT && !hasReachedMaxOnce) {
                        setHasReachedMaxOnce(true);
                        requestAnimationFrame(() => maybeAutoScroll(false));
                    }
                }}
            >
                <FlatList
                    ref={listRef}
                    style={{ flex: 1 }}
                    data={messages}
                    keyExtractor={(i) => i._id || i.localId}
                    renderItem={renderItem}
                    contentContainerStyle={S.listContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    scrollEnabled
                    onContentSizeChange={(_w, h) => {
                        contentHeightRef.current = h;
                        if (h >= CHAT_MAX_HEIGHT && !hasReachedMaxOnce) {
                            setHasReachedMaxOnce(true);
                            requestAnimationFrame(() => maybeAutoScroll(false));
                        } else {
                            if (isAtBottom()) requestAnimationFrame(() => maybeAutoScroll(true));
                        }
                    }}
                    onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                    onScrollBeginDrag={() => { isUserDraggingRef.current = true; }}
                    onScrollEndDrag={() => {
                        isUserDraggingRef.current = false;
                        if (isAtBottom()) requestAnimationFrame(() => maybeAutoScroll(true));
                    }}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator
                />
            </View>

            {typingUserIds.length > 0 && (
                <Text style={S.typing}>Someone is typing…</Text>
            )}

            <View style={S.inputRow}>
                <TextInput
                    value={input}
                    onChangeText={onChangeInput}
                    placeholder="Say something…"
                    placeholderTextColor="#bbb"
                    style={S.input}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                />
                <TouchableOpacity onPress={handleSend} style={S.sendBtn}>
                    <Text style={S.sendTxt}>Send</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const S = StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, bottom: 35, paddingBottom: 12 },
    pinned: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6 },
    pinnedLabel: { color: '#93c5fd', fontWeight: '700', marginBottom: 2, fontSize: 12 },
    pinnedText: { color: '#fff' },
    listBox: { marginHorizontal: 8, borderRadius: 12, overflow: 'hidden' },
    listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' },
    bubble: { backgroundColor: 'rgba(0,0,0,0.55)', padding: 8, borderRadius: 10, marginBottom: 6 },
    pending: { opacity: 0.6 },
    name: { color: '#9fd3ff', fontWeight: '700', marginBottom: 2, fontSize: 12 },
    msg: { color: '#fff' },
    typing: { color: '#ddd', fontStyle: 'italic', paddingHorizontal: 12, marginBottom: 6 },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12 },
    input: { flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 10, color: '#fff' },
    kbCloseBtn: { backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
    kbCloseTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
    sendBtn: { backgroundColor: '#10b981', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
    sendTxt: { color: '#fff', fontWeight: '700' },
    system: { color: '#ddd', fontStyle: 'italic', marginBottom: 6 },
});
