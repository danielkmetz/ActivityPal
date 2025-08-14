import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';

export default function SubmitButton({
  label = 'Post',
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
}) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.submitButton, isDisabled && styles.disabled, style]}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={[styles.submitButtonText, { marginLeft: 8 }, textStyle]}>
            {label}
          </Text>
        </View>
      ) : (
        <Text style={[styles.submitButtonText, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  submitButton: {
    backgroundColor: '#009999',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  disabled: {
    opacity: 0.6,
  },
  submitButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
});
