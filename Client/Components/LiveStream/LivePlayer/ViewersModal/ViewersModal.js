import React, { useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import Notch from '../../../Notch/Notch';
import useSlideDownDismiss from '../../../../utils/useSlideDown';

export default function ViewersModal({
  visible,
  onClose,
  viewers = [],
  loading = false,
  error = null,
  onRefresh = () => {},
  title = 'Viewers',
  hostId = null,
}) {
  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

  useEffect(() => {
    if (visible) {
      animateIn();
    } else {
      (async () => {
        await animateOut();
        onClose?.();
      })();
    }
  }, [visible]);

  const filteredViewers = useMemo(() => {
    return (viewers || []).filter(v => {
      if (!v) return false;
      // Exclude anything marked as host
      if (v.isHost) return false;
      // If hostId is provided, exclude that id too (belt & suspenders)
      if (hostId != null && String(v.id) === String(hostId)) return false;
      return true;
    });
  }, [viewers, hostId]);

  const keyExtractor = (item, idx) => String(item?.id ?? idx);

  const handleBackdropPress = () => {
    // animate down, then call onClose inside the hook
    animateOut();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleBackdropPress}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={S.overlay}>
          <GestureDetector gesture={gesture}>
            <TouchableWithoutFeedback>
              <Animated.View style={[S.sheet, animatedStyle]}>
                <Notch />
                <View style={S.header}>
                  <Text style={S.title}>{title}</Text>
                  <Pressable onPress={onRefresh} style={S.refresh}>
                    <Text style={S.refreshTxt}>Refresh</Text>
                  </Pressable>
                  {/* Optional close X on header (kept button at bottom too) */}
                </View>
                {loading ? (
                  <View style={S.center}><ActivityIndicator /></View>
                ) : error ? (
                  <View style={S.center}><Text style={S.err}>{error}</Text></View>
                ) : viewers?.length ? (
                  <FlatList
                    data={filteredViewers}
                    keyExtractor={keyExtractor}
                    ItemSeparatorComponent={() => <View style={S.sep} />}
                    contentContainerStyle={S.listContent}
                    renderItem={({ item }) => (
                      <View style={S.row}>
                        {item?.avatarUrl ? (
                          <Image source={{ uri: item.avatarUrl }} style={S.avatar} />
                        ) : (
                          <View style={S.avatarFallback}>
                            <Text style={S.avatarTxt}>
                              {(item?.name || 'V')[0].toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={S.name} numberOfLines={1}>
                          {item?.name || 'Viewer'}
                        </Text>
                        {item?.isHost ? <Text style={S.hostTag}>Host</Text> : null}
                      </View>
                    )}
                    // ensures list doesn't jump when short
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  />
                ) : (
                  <View style={S.center}><Text style={S.muted}>No viewers yet</Text></View>
                )}
              </Animated.View>
            </TouchableWithoutFeedback>
          </GestureDetector>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const SHEET_MAX_H = Platform.select({ ios: '72%', android: '72%' });

const S = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 16,
    maxHeight: SHEET_MAX_H,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  refresh: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  refreshTxt: { color: '#fff', fontWeight: '700' },
  center: { paddingVertical: 24, alignItems: 'center' },
  listContent: { paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222' },
  avatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#222'
  },
  avatarTxt: { color: '#fff', fontWeight: '800' },
  name: { color: '#fff', fontWeight: '700', flex: 1 },
  hostTag: { color: '#9ca3af', fontSize: 12 },
  sep: { height: 1, backgroundColor: '#1f2937' },
  muted: { color: '#9ca3af' },
  err: { color: '#ef4444' },
  close: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeTxt: { color: '#fff', fontWeight: '800' },
});
