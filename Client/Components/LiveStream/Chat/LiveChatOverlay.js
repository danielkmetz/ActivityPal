import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import io from 'socket.io-client';
import { useSelector } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import { getUserToken } from '../../functions';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL;

export default function LiveChatOverlay({ liveId }) {
  const user = useSelector(selectUser);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const socketRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const token = await getUserToken();
      const socket = io(SOCKET_URL, {
        transports: ['websocket'],
        auth: { token },
        query: { liveId },
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('live:join', { liveId, userId: user?.id, username: user?.username });
      });

      socket.on('chat:message', (msg) => {
        if (!mounted) return;
        setMessages((prev) => [...prev, msg]);
        requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
      });

      socket.on('live:system', (msg) => {
        if (!mounted) return;
        setMessages((prev) => [...prev, { ...msg, system: true }]);
      });

      socket.on('disconnect', () => {
        if (!mounted) return;
        setMessages((prev) => [...prev, { text: 'Disconnected. Reconnecting…', system: true, ts: Date.now() }]);
      });
    })();

    return () => {
      const s = socketRef.current;
      s?.emit?.('live:leave', { liveId });
      s?.disconnect?.();
      mounted = false;
    };
  }, [liveId, user?.id, user?.username]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    socketRef.current?.emit('chat:send', {
      liveId,
      text,
      userId: user?.id,
      username: user?.username || 'Anon',
      ts: Date.now(),
    });
    setDraft('');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={S.wrapper}>
      <View style={S.messages}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m, i) => String(m.ts || i)}
          renderItem={({ item }) => (
            <Text style={[S.msg, item.system && { opacity: 0.6 }]}>
              {!item.system && <Text style={S.username}>{item.username}: </Text>}
              <Text style={S.text}>{item.text}</Text>
            </Text>
          )}
        />
      </View>
      <View style={S.inputRow}>
        <TextInput
          style={S.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Say something…"
          placeholderTextColor="#bbb"
          onSubmitEditing={send}
        />
        <TouchableOpacity onPress={send} style={S.sendBtn}><Text style={S.sendTxt}>Send</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  wrapper:{ position:'absolute', left:0, right:0, bottom:0 },
  messages:{ maxHeight:'45%', paddingHorizontal:10, paddingBottom:8 },
  msg:{ color:'#fff', marginVertical:2 },
  username:{ color:'#facc15', fontWeight:'700' },
  text:{ color:'#fff' },
  inputRow:{ flexDirection:'row', padding:10, gap:8, alignItems:'center' },
  input:{ flex:1, backgroundColor:'rgba(255,255,255,0.1)', color:'#fff',
          paddingHorizontal:12, paddingVertical:10, borderRadius:18 },
  sendBtn:{ paddingHorizontal:12, paddingVertical:10, backgroundColor:'#2563eb', borderRadius:18 },
  sendTxt:{ color:'#fff', fontWeight:'700' },
});
