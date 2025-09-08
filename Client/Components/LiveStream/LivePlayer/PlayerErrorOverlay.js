import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function PlayerErrorOverlay({ message = "Couldn’t play the stream.", details, onRetry }) {
  return (
    <View style={S.errorOverlay}>
      <Text style={S.errorText}>{message}</Text>
      {!!details && <Text style={S.subtle}>{details}</Text>}
      {!!onRetry && (
        <TouchableOpacity onPress={onRetry}>
          <Text style={S.retry}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  errorOverlay: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: { color: '#fff', fontWeight: '700', marginBottom: 6 },
  subtle: { color: '#aaa', marginTop: 6, textAlign: 'center' },
  retry: { color: '#60a5fa', marginTop: 10, fontWeight: '700' },
});
