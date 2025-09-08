import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';

export default function ViewersModal({
  visible,
  onClose,
  viewers = [],
  loading = false,
  error = null,
  onRefresh = () => {},
  title = 'Viewers',
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={S.overlay}>
        <View style={S.card}>
          <View style={S.header}>
            <Text style={S.title}>{title}</Text>
            <Pressable onPress={onRefresh} style={S.refresh}>
              <Text style={S.refreshTxt}>Refresh</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={S.center}><ActivityIndicator /></View>
          ) : error ? (
            <View style={S.center}><Text style={S.err}>{error}</Text></View>
          ) : viewers?.length ? (
            <FlatList
              data={viewers}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <View style={S.sep} />}
              renderItem={({ item }) => (
                <View style={S.row}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={S.avatar} />
                  ) : (
                    <View style={S.avatarFallback}>
                      <Text style={S.avatarTxt}>{(item.name || 'V')[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={S.name} numberOfLines={1}>
                    {item.name || 'Viewer'}
                  </Text>
                  {item.isHost ? <Text style={S.hostTag}>Host</Text> : null}
                </View>
              )}
            />
          ) : (
            <View style={S.center}><Text style={S.muted}>No viewers yet</Text></View>
          )}

          <Pressable onPress={onClose} style={S.close}>
            <Text style={S.closeTxt}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { width: '86%', maxHeight: '70%', backgroundColor: '#111', borderRadius: 16, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  refresh: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  refreshTxt: { color: '#fff', fontWeight: '700' },
  center: { paddingVertical: 24, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222' },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#222' },
  avatarTxt: { color: '#fff', fontWeight: '800' },
  name: { color: '#fff', fontWeight: '700', flex: 1 },
  hostTag: { color: '#9ca3af', fontSize: 12 },
  sep: { height: 1, backgroundColor: '#1f2937' },
  muted: { color: '#9ca3af' },
  err: { color: '#ef4444' },
  close: { marginTop: 10, backgroundColor: '#2563EB', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  closeTxt: { color: '#fff', fontWeight: '800' },
});
