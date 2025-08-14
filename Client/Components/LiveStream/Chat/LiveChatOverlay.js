import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import io from 'socket.io-client';
import { useSelector } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL;

export default function LiveChatOverlay({ liveId }) {
  const user = useSelector(selectUser);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const socketRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      forceNew: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('live:join', { liveId, userId: user?.id, username: user?.username });
    });

    socket.on('chat:message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      // auto-scroll
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    });

    return () => {
      socket.emit('live:leave', { liveId });
      socket.disconnect();
    };
  }, [liveId, user?.id, user?.username]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const msg = {
      liveId,
      text,
      userId: user?.id,
      username: user?.username || 'Anon',
      ts: Date.now(),
    };
    socketRef.current?.emit('chat:send', msg);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.wrapper}
    >
      <View style={styles.messages}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m, i) => String(m.ts || i)}
          renderItem={({ item }) => (
            <Text style={styles.msg}>
              <Text style={styles.username}>{item.username}: </Text>
              <Text style={styles.text}>{item.text}</Text>
            </Text>
          )}
        />
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Say something…"
          placeholderTextColor="#bbb"
          onSubmitEditing={send}
        />
        <TouchableOpacity onPress={send} style={styles.sendBtn}>
          <Text style={styles.sendTxt}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  messages: {
    maxHeight: '45%',
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  msg: { color: '#fff', marginVertical: 2 },
  username: { color: '#facc15', fontWeight: '700' },
  text: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    padding: 10,
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
  },
  sendBtn: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#2563eb', borderRadius: 18 },
  sendTxt: { color: '#fff', fontWeight: '700' },
});
