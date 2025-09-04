import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

/**
 * Props:
 * - countdown: number
 * - onCancelCountdown: () => void
 * - onArm: () => void
 * - isEnding?: boolean
 * - isLive?: boolean     // <-- add this
 */
export default function LiveBottomBar({
  countdown,
  onCancelCountdown,
  onArm,
  isEnding = false,
  isLive = false,        // <-- default false
}) {
  return (
    <View style={[S.bottomBar, isEnding && { opacity: 0.001 }]}>

      {/* Countdown takes precedence */}
      {countdown > 0 ? (
        <>
          <Text onPress={onCancelCountdown} style={S.cancel}>Cancel</Text>
          <Text style={S.count}>{countdown}</Text>
        </>
      ) : (
        // Only render the pressable when NOT live
        !isLive && (
          <Pressable
            onPress={onArm}
            style={S.recordBtn}
            accessibilityRole="button"
            accessibilityLabel="Start live countdown"
          >
            <View style={S.dot} />
          </Pressable>
        )
      )}
    </View>
  );
}

const S = StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtn: {
    width: 74, height: 74, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)'
  },
  dot: {
    width: 46, height: 46, borderRadius: 26,
    backgroundColor: '#e11d48',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)'
  },
  count: { color: '#fff', fontSize: 72, fontWeight: '900' },
  cancel: { color: '#fff', marginBottom: 16, fontWeight: '700' },
});
