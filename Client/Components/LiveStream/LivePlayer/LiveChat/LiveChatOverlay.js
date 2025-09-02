import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard, Dimensions } from 'react-native';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../../Slices/UserSlice';
import { getUserToken } from '../../../../functions';
import {
    connectLiveSocket,
    onLiveEvents,
    clearLiveHandlers,
    joinLiveStream,
    leaveLiveStream,
    sendLiveMessage,
    setLiveTyping,
} from '../../../../app/socket/liveChatSocketClient';

const SCREEN_H = Dimensions.get('window').height;
const CHAT_MAX_HEIGHT = Math.round(SCREEN_H * 0.30); // fixed height to ensure the list has space
const BOTTOM_EPS = 10; // px tolerance for "near bottom"

export default function LiveChatOverlay({ liveId }) {
    const user = useSelector(selectUser);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]); // newest at end
    const [pinnedId, setPinnedId] = useState(null);
    const [typingUserIds, setTypingUserIds] = useState(new Set());

    const localIds = useRef(new Set()); // optimistic localIds to reconcile
    const listRef = useRef();
    const contentHeightRef = useRef(0);
    const layoutHeightRef = useRef(0);
    const scrollYRef = useRef(0);
    const [hasReachedMaxOnce, setHasReachedMaxOnce] = useState(false);
    const isUserDraggingRef = useRef(false);

    // connect + join
    useEffect(() => {
        let mounted = true;
        (async () => {
            const token = await getUserToken();
            await connectLiveSocket(process.env.EXPO_PUBLIC_SERVER_URL, token);

            onLiveEvents({
                onNew: (msg) => {
                    if (!mounted) return;
                    setMessages((prev) => {
                        const exists =
                            prev.some(m => m._id === msg._id) ||
                            (msg.localId && prev.some(m => m.localId === msg.localId));

                        if (exists) {
                            return prev.map(m => (msg.localId && m.localId === msg.localId) ? msg : m);
                        }

                        if (msg.localId && localIds.current.has(msg.localId)) {
                            localIds.current.delete(msg.localId);
                            return [...prev.filter(m => m.localId !== msg.localId), msg];
                        }

                        return [...prev, msg];
                    });

                    requestAnimationFrame(() => maybeAutoScroll(true));
                },
                onDeleted: ({ messageId }) => {
                    if (!mounted) return;
                    setMessages((prev) => prev.filter(m => m._id !== messageId));
                },
                onPinned: ({ messageId }) => {
                    if (!mounted) return;
                    setPinnedId(messageId);
                },
                onUnpinned: () => {
                    if (!mounted) return;
                    setPinnedId(null);
                },
                onSystem: () => { },
                onTyping: ({ userId }) => {
                    if (!mounted) return;
                    setTypingUserIds((prev) => new Set(prev).add(String(userId)));
                    setTimeout(() => {
                        setTypingUserIds((prev) => {
                            const next = new Set(prev);
                            next.delete(String(userId));
                            return next;
                        });
                    }, 3000);
                },
                onTypingStop: ({ userId }) => {
                    if (!mounted) return;
                    setTypingUserIds((prev) => {
                        const next = new Set(prev);
                        next.delete(String(userId));
                        return next;
                    });
                },
            });

            try {
                await joinLiveStream(liveId);
            } catch (e) {
                console.warn('live join failed:', e.message);
            }
        })();

        return () => {
            mounted = false;
            leaveLiveStream(liveId);
            clearLiveHandlers();
        };
    }, [liveId]);

    const pinnedMessage = useMemo(() => {
        if (!pinnedId) return null;
        return messages.find(m => String(m._id) === String(pinnedId)) || null;
    }, [pinnedId, messages]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text) return;

        const optimistic = {
            _id: `local:${Date.now()}`,
            localId: `local-${Math.random().toString(36).slice(2)}`,
            liveStreamId: liveId,
            userId: user?.id || 'me',
            userName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Me',
            userPicUrl: user?.profilePicUrl || null,
            type: 'message',
            text,
            offsetSec: 0,
            createdAt: new Date().toISOString(),
            pending: true,
        };
        localIds.current.add(optimistic.localId);
        setMessages((prev) => [...prev, optimistic]);
        setInput('');
        requestAnimationFrame(() => maybeAutoScroll(true));

        const res = await sendLiveMessage({ liveStreamId: liveId, text });
        if (!res.ok) {
            setMessages((prev) => prev.filter(m => m.localId !== optimistic.localId));
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
    }, [messages.length]);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={S.wrap}
        >
            {pinnedMessage && (
                <View style={S.pinned}>
                    <Text style={S.pinnedLabel}>Pinned</Text>
                    <Text numberOfLines={1} style={S.pinnedText}>{pinnedMessage.text}</Text>
                </View>
            )}
            {/* Give the container an explicit height so FlatList has space */}
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
                    onContentSizeChange={(w, h) => {
                        contentHeightRef.current = h;
                        if (h >= CHAT_MAX_HEIGHT && !hasReachedMaxOnce) {
                            setHasReachedMaxOnce(true);
                            requestAnimationFrame(() => maybeAutoScroll(false));
                        } else {
                            if (isAtBottom()) requestAnimationFrame(() => maybeAutoScroll(true));
                        }
                    }}
                    onScroll={(e) => {
                        scrollYRef.current = e.nativeEvent.contentOffset.y;
                    }}
                    onScrollBeginDrag={() => { isUserDraggingRef.current = true; }}
                    onScrollEndDrag={() => {
                        isUserDraggingRef.current = false;
                        if (isAtBottom()) requestAnimationFrame(() => maybeAutoScroll(true));
                    }}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator
                />
            </View>
            {typingUserIds.size > 0 && (
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
                <TouchableOpacity onPress={Keyboard.dismiss} style={S.kbCloseBtn}>
                    <Text style={S.kbCloseTxt}>⌄</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSend} style={S.sendBtn}>
                    <Text style={S.sendTxt}>Send</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const S = StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, bottom: 35, paddingBottom: 12, },
    pinned: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6 },
    pinnedLabel: { color: '#93c5fd', fontWeight: '700', marginBottom: 2, fontSize: 12 },
    pinnedText: { color: '#fff' },

    listBox: { marginHorizontal: 8, borderRadius: 12, overflow: 'hidden' },
    listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },

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
